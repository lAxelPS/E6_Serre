import paho.mqtt.client as mqtt
import sqlite3
import time
import json
from datetime import datetime
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

# ─── CONFIGURATION ───────────────────────────────────────────
DB_PATH      = "SIC_base_de_donnees.db"
MQTT_BROKER  = "127.0.0.1"
MQTT_PORT    = 1883
# ─────────────────────────────────────────────────────────────

# ─── CONFIGURATION FLASK ─────────────────────────────────────
app = Flask(__name__)
CORS(app)

latest_payload = "{}"

@app.route('/api/data')
def api_data():
    return Response(latest_payload, mimetype='application/json')

# ─── SQLITE ──────────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

def init_db():

    cursor.executescript("""

        CREATE TABLE IF NOT EXISTS capteurs (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            nom       TEXT NOT NULL,
            type      TEXT NOT NULL,
            unite     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mesures (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            capteur_id  INTEGER NOT NULL,
            valeur      REAL    NOT NULL,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            statut      TEXT    DEFAULT 'normal',
            FOREIGN KEY (capteur_id) REFERENCES capteurs(id)
        );

        CREATE TABLE IF NOT EXISTS alertes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            capteur_id  INTEGER NOT NULL,
            niveau      TEXT NOT NULL,
            message     TEXT NOT NULL,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            acquittee   INTEGER DEFAULT 0,
            FOREIGN KEY (capteur_id) REFERENCES capteurs(id)
        );

        CREATE TABLE IF NOT EXISTS logs_systeme (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            niveau    TEXT NOT NULL,
            composant TEXT,
            message   TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

    """)

    capteurs = [
        ("DHT22",       "temperature",   "°C"),
        ("DHT22",       "humidite_air",  "%"),
        ("BH1750",      "luminosite",    "lux"),
        ("Capteur sol", "humidite_sol",  "%"),
    ]

    for nom, type_, unite in capteurs:

        cursor.execute(
            "INSERT OR IGNORE INTO capteurs (id, nom, type, unite) VALUES "
            "((SELECT id FROM capteurs WHERE type=?), ?, ?, ?)",
            (type_, nom, type_, unite)
        )

        cursor.execute(
            "INSERT INTO capteurs (nom, type, unite) "
            "SELECT ?,?,? WHERE NOT EXISTS "
            "(SELECT 1 FROM capteurs WHERE type=?)",
            (nom, type_, unite, type_)
        )

    conn.commit()

    log_systeme(
        "INFO",
        "Raspberry",
        "Base de données initialisée"
    )

# ─── FONCTIONS SQL ───────────────────────────────────────────

def get_capteur_id(type_capteur):

    row = cursor.execute(
        "SELECT id FROM capteurs WHERE type = ?",
        (type_capteur,)
    ).fetchone()

    return row[0] if row else None

def verifier_statut(type_capteur, valeur):

    seuils = {

        "temperature": (
            18.5,
            26.5,
            13,
            35
        ),

        "humidite_air": (
            60,
            80,
            40,
            90
        ),

        "luminosite": (
            10000,
            20000,
            7000,
            25000
        ),

        "humidite_sol": (
            40,
            80,
            40,
            90
        ),
    }

    if type_capteur not in seuils:
        return "normal"

    mn, mx, crit_mn, crit_mx = seuils[type_capteur]

    if valeur < crit_mn or valeur > crit_mx:
        return "critique"

    elif valeur < mn or valeur > mx:
        return "alerte"

    return "normal"

def inserer_mesure(type_capteur, valeur):

    capteur_id = get_capteur_id(type_capteur)

    if capteur_id is None:
        print(f"⚠️ Capteur inconnu : {type_capteur}")
        return

    statut = verifier_statut(type_capteur, valeur)

    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    cursor.execute(
        """
        INSERT INTO mesures
        (capteur_id, valeur, timestamp, statut)
        VALUES (?, ?, ?, ?)
        """,
        (
            capteur_id,
            valeur,
            timestamp,
            statut
        )
    )

    if statut in ("alerte", "critique"):

        message = (
            f"{type_capteur} = {valeur}"
            f" — statut : {statut}"
        )

        cursor.execute(
            """
            INSERT INTO alertes
            (capteur_id, niveau, message, timestamp)
            VALUES (?, ?, ?, ?)
            """,
            (
                capteur_id,
                statut,
                message,
                timestamp
            )
        )

        print(
            f"🔴 Alerte [{statut.upper()}] : {message}"
        )

    conn.commit()

def log_systeme(niveau, composant, message):

    cursor.execute(
        """
        INSERT INTO logs_systeme
        (niveau, composant, message)
        VALUES (?, ?, ?)
        """,
        (
            niveau,
            composant,
            message
        )
    )

    conn.commit()

def afficher_dernieres_mesures():

    rows = cursor.execute("""

        SELECT
            c.type,
            m.valeur,
            c.unite,
            m.statut,
            m.timestamp

        FROM mesures m

        JOIN capteurs c
        ON m.capteur_id = c.id

        WHERE m.id IN (
            SELECT MAX(id)
            FROM mesures
            GROUP BY capteur_id
        )

        ORDER BY c.id

    """).fetchall()

    print("\n📊 Dernières mesures :")

    for r in rows:

        print(
            f"{r['type']:<15}"
            f"{r['valeur']:>8.1f} "
            f"{r['unite']:<5}"
            f"[{r['statut']}] "
            f"{r['timestamp']}"
        )

# ─── LABELS ──────────────────────────────────────────────────

LABELS = {
    "temperature":  "🌡️ Température",
    "humidite_air": "💧 Humidité air",
    "luminosite":   "☀️ Luminosité",
    "humidite_sol": "🌱 Humidité sol",
}

UNITES = {
    "temperature":  "°C",
    "humidite_air": "%",
    "luminosite":   "lux",
    "humidite_sol": "%",
}

# ─── ETAT ACTIONNEURS ────────────────────────────────────────

etat_actionneurs = {
    "pompe": False,
    "ventilo": False,
    "led": False
}

def envoyer_actionneur(topic, nouvel_etat, nom):

    global etat_actionneurs

    ancien_etat = etat_actionneurs[nom]

    # Evite le spam MQTT
    if ancien_etat == nouvel_etat:
        return

    payload = "ON" if nouvel_etat else "OFF"

    # Commande vers ESP8266
    client.publish(topic, payload)

    # Etat vers dashboard
    client.publish(
        f"esp8266/status/{nom}",
        payload
    )

    etat_actionneurs[nom] = nouvel_etat

    print(f"⚡ {nom} -> {payload}")

    log_systeme(
        "INFO",
        "AUTOMATIQUE",
        f"{nom} -> {payload}"
    )

# ─── API HISTORIQUE ──────────────────────────────────────────

@app.route('/api/historique')
def api_historique():

    type_filter = request.args.get("type", None)

    try:

        if type_filter:

            rows = conn.execute("""

                SELECT
                    m.id,
                    m.valeur,
                    m.timestamp,
                    m.statut,
                    c.type,
                    c.unite

                FROM mesures m

                JOIN capteurs c
                ON m.capteur_id = c.id

                WHERE c.type = ?

                ORDER BY m.timestamp DESC

            """, (type_filter,)).fetchall()

        else:

            rows = conn.execute("""

                SELECT
                    m.id,
                    m.valeur,
                    m.timestamp,
                    m.statut,
                    c.type,
                    c.unite

                FROM mesures m

                JOIN capteurs c
                ON m.capteur_id = c.id

                ORDER BY m.timestamp DESC

            """).fetchall()

        result = []

        for r in rows:

            type_ = r["type"]

            result.append({

                "id": r["id"],
                "type": type_,
                "label": LABELS.get(type_, type_),
                "val": r["valeur"],
                "unite": r["unite"]
                or UNITES.get(type_, ""),
                "statut": r["statut"],
                "ts": r["timestamp"]

            })

        return jsonify(result)

    except Exception as e:

        return jsonify({
            "erreur": str(e)
        }), 500

@app.route('/api/statut')
def api_statut():

    try:

        nb = conn.execute(
            "SELECT COUNT(*) FROM mesures"
        ).fetchone()[0]

        return jsonify({
            "ok": True,
            "nb_mesures": nb
        })

    except Exception as e:

        return jsonify({
            "ok": False,
            "erreur": str(e)
        }), 500

# ─── MQTT CALLBACKS ──────────────────────────────────────────

def on_connect(client, userdata, flags, rc):

    global flag_connected

    flag_connected = 1

    client_subscriptions(client)

    log_systeme(
        "INFO",
        "Raspberry",
        "Connecté au broker MQTT"
    )

    print("✅ Connected MQTT")

def on_disconnect(client, userdata, rc):

    global flag_connected

    flag_connected = 0

    log_systeme(
        "WARNING",
        "Raspberry",
        "Déconnecté MQTT"
    )

    print("❌ Disconnected MQTT")

def callback_esp32_sensor1(client, userdata, msg):

    global latest_payload

    try:

        raw_data = msg.payload.decode('utf-8')

        valeur = json.loads(raw_data)

        required_keys = [
            "temperature",
            "humidity",
            "lux",
            "soil"
        ]

        if not all(
            key in valeur
            for key in required_keys
        ):
            print("⚠️ JSON incomplet")
            return

        print("\n📡 Données ESP reçues")

        temperature = valeur["temperature"]
        humidity    = valeur["humidity"]
        lux         = valeur["lux"]
        soil        = valeur["soil"]

        latest_payload = raw_data

        print(f"temperature = {temperature}")
        print(f"humidity    = {humidity}")
        print(f"lux         = {lux}")
        print(f"soil        = {soil}")

        inserer_mesure(
            "temperature",
            temperature
        )

        inserer_mesure(
            "humidite_air",
            humidity
        )

        inserer_mesure(
            "luminosite",
            lux
        )

        inserer_mesure(
            "humidite_sol",
            soil
        )

        # ====================================================
        # MODE AUTOMATIQUE
        # ====================================================

        # ---------------- VENTILO ----------------

        if temperature > 26.5:

            envoyer_actionneur(
                "esp8266/cmd/ventilo",
                True,
                "ventilo"
            )
            print('ventilo, True')

        elif temperature < 25.5:

            envoyer_actionneur(
                "esp8266/cmd/ventilo",
                False,
                "ventilo"
            )
            print('ventilo, False')

        # ---------------- POMPE ----------------

        if soil < 40:

            envoyer_actionneur(
                "esp8266/cmd/pompe",
                True,
                "pompe"
            )
            print('pompe, True')

        elif soil > 80:

            envoyer_actionneur(
                "esp8266/cmd/pompe",
                False,
                "pompe"
            )
            print('pompe, False')

        # ---------------- LED ----------------

        if lux < 10000:

            envoyer_actionneur(
                "esp8266/cmd/led",
                True,
                "led"
            )
            print('led, True')

        elif lux > 11000:

            envoyer_actionneur(
                "esp8266/cmd/led",
                False,
                "led"
            )
            print('led False')

        print("✅ Mesures enregistrées")

        afficher_dernieres_mesures()

        log_systeme(
            "INFO",
            "ESP32",
            (
                f"Mesures reçues "
                f"temp={temperature} "
                f"hum={humidity} "
                f"lux={lux} "
                f"soil={soil}"
            )
        )

    except Exception as e:

        print(
            f"❌ Erreur callback : {e}"
        )

        log_systeme(
            "ERROR",
            "ESP32",
            f"Erreur réception : {e}"
        )

def callback_rpi_broadcast(client, userdata, msg):

    message = msg.payload.decode('utf-8')

    print(f"📢 Broadcast : {message}")

    log_systeme(
        "INFO",
        "Raspberry",
        f"Broadcast : {message}"
    )

def client_subscriptions(client):

    client.subscribe("esp8266/#")
    client.subscribe("rpi/broadcast")

# ─── DEMARRAGE ───────────────────────────────────────────────

init_db()

client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION1,
    'rpi_client1'
)

flag_connected = 0

client.on_connect = on_connect
client.on_disconnect = on_disconnect

client.message_callback_add(
    'esp8266/sensor1',
    callback_esp32_sensor1
)

client.message_callback_add(
    'rpi/broadcast',
    callback_rpi_broadcast
)

try:

    client.connect(
        MQTT_BROKER,
        MQTT_PORT
    )

    client.loop_start()

    client_subscriptions(client)

    print("......client setup complete............")

except Exception as e:

    print(f"❌ Erreur Broker : {e}")

if __name__ == '__main__':

    print(
        "🚀 Flask lancé port 5000"
    )

    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False
    )