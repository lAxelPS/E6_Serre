import paho.mqtt.client as mqtt
import sqlite3
import time
import json
from datetime import datetime
from flask import Flask, Response
from flask_cors import CORS

# ─── CONFIGURATION ───────────────────────────────────────────
DB_PATH      = "SIC_base_de_donnees.db"
MQTT_BROKER  = "127.0.0.1"
MQTT_PORT    = 1883
# ─────────────────────────────────────────────────────────────

# ─── CONFIGURATION FLASK (POUR LE DASHBOARD HTML) ────────────
app = Flask(__name__)
CORS(app)
latest_payload = "{}"  # Stockera le dernier JSON valide reçu

@app.route('/api/data')
def api_data():
    """Envoie le dernier JSON valide au Dashboard."""
    return Response(latest_payload, mimetype='application/json')

# ─── CONNEXION SQLITE ─────────────────────────────────────────
conn   = sqlite3.connect(DB_PATH, check_same_thread=False)
cursor = conn.cursor()

def init_db():
    """Crée les tables si elles n'existent pas encore."""
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

    # Insère les 4 capteurs s'ils n'existent pas déjà
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
        # Si aucune ligne n'existe encore pour ce type, on insère
        cursor.execute(
            "INSERT INTO capteurs (nom, type, unite) "
            "SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM capteurs WHERE type=?)",
            (nom, type_, unite, type_)
        )
    conn.commit()
    log_systeme("INFO", "Raspberry", "Base de données initialisée")

# ─── FONCTIONS SQL ────────────────────────────────────────────

def get_capteur_id(type_capteur):
    """Retourne l'id d'un capteur par son type."""
    row = cursor.execute(
        "SELECT id FROM capteurs WHERE type = ?", (type_capteur,)
    ).fetchone()
    return row[0] if row else None

def verifier_statut(type_capteur, valeur):
    """Retourne 'normal', 'alerte' ou 'critique' selon la valeur."""
    #valeurs pour tomates et poivrons
    seuils = {
        "temperature" : (18.5,  26.5,  13,  35),
        "humidite_air": (60,  80,  40,  90),
        "luminosite"  : (10000, 20000, 7000, 25000),
        "humidite_sol": (70,  80,  40,  90),
    }
    if type_capteur not in seuils:
        return "normal"
    mn, mx, crit_mn, crit_mx = seuils[type_capteur]
    if valeur < crit_mn or valeur > crit_mx:
        return "critique"
    elif valeur < mn or valeur > mx:
        return "alerte"
    elif type_capteur=="luminosite":
        return "normal"
    return "normal"

def inserer_mesure(type_capteur, valeur):
    """Insère une mesure et crée une alerte si nécessaire."""
    capteur_id = get_capteur_id(type_capteur)
    if capteur_id is None:
        print(f"⚠️  Capteur inconnu : {type_capteur}")
        return

    statut    = verifier_statut(type_capteur, valeur)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # INSERT mesure
    cursor.execute(
        "INSERT INTO mesures (capteur_id, valeur, timestamp, statut) VALUES (?, ?, ?, ?)",
        (capteur_id, valeur, timestamp, statut)
    )

    # Si alerte ou critique → INSERT dans alertes
    if statut in ("alerte", "critique"):
        message = f"{type_capteur} = {valeur} — statut : {statut}"
        cursor.execute(
            "INSERT INTO alertes (capteur_id, niveau, message, timestamp) VALUES (?, ?, ?, ?)",
            (capteur_id, statut, message, timestamp)
        )
        print(f"  🔴 Alerte [{statut.upper()}] : {message}")

    conn.commit()

def log_systeme(niveau, composant, message):
    """Insère un log dans logs_systeme."""
    cursor.execute(
        "INSERT INTO logs_systeme (niveau, composant, message) VALUES (?, ?, ?)",
        (niveau, composant, message)
    )
    conn.commit()

def afficher_dernieres_mesures():
    """Affiche les dernières valeurs de chaque capteur."""
    rows = cursor.execute("""
        SELECT c.type, m.valeur, c.unite, m.statut, m.timestamp
        FROM mesures m
        JOIN capteurs c ON m.capteur_id = c.id
        WHERE m.id IN (SELECT MAX(id) FROM mesures GROUP BY capteur_id)
        ORDER BY c.id
    """).fetchall()
    print("\n  📊 Dernières mesures en base :")
    for type_, valeur, unite, statut, ts in rows:
        print(f"    {type_:<15} {valeur:>8.1f} {unite:<5}  [{statut}]  {ts}")

# ─── CALLBACKS MQTT ───────────────────────────────────────────

def on_connect(client, userdata, flags, rc):
    global flag_connected
    flag_connected = 1
    client_subscriptions(client)
    log_systeme("INFO", "Raspberry", "Connecté au broker MQTT")
    print("✅ Connected to MQTT server")

def on_disconnect(client, userdata, rc):
    global flag_connected
    flag_connected = 0
    log_systeme("WARNING", "Raspberry", "Déconnecté du broker MQTT")
    print("❌ Disconnected from MQTT server")

def callback_esp32_sensor1(client, userdata, msg):
    global latest_payload
    try:
        # 1. On décode la chaîne reçue
        raw_data = msg.payload.decode('utf-8')
        valeur  = json.loads(raw_data)
        
        # 2. Vérification de la présence des 4 données obligatoires
        required_keys = ["temperature", "humidity", "lux", "soil"]
        if not all(key in valeur for key in required_keys):
            print("⚠️ Données JSON incomplètes ignorées")
            return

        print("\n📡 ESP sensor1 data reçu :")

        temperature = valeur["temperature"]
        humidity    = valeur["humidity"]
        lux         = valeur["lux"]
        soil        = valeur["soil"]

        # 3. Les données sont validées, on met à jour la variable pour Flask
        latest_payload = raw_data

        print(f"  temperature = {temperature} °C")
        print(f"  humidity    = {humidity} %")
        print(f"  lux         = {lux} lux")
        print(f"  soil        = {soil} %")

        # ── Insertion en base SQLite ──
        inserer_mesure("temperature",   temperature)
        inserer_mesure("humidite_air",  humidity)
        inserer_mesure("luminosite",    lux)
        inserer_mesure("humidite_sol",  soil)

        print("  ✅ Mesures enregistrées en base")
        afficher_dernieres_mesures()

        log_systeme("INFO", "ESP32",
                    f"Mesures reçues — temp={temperature} hum={humidity} lux={lux} sol={soil}")

    except Exception as e:
        print(f"  ❌ Erreur callback_esp32_sensor1 : {e}")
        log_systeme("ERROR", "ESP32", f"Erreur réception mesures : {e}")

def callback_rpi_broadcast(client, userdata, msg):
    message = msg.payload.decode('utf-8')
    print(f"📢 RPi Broadcast : {message}")
    log_systeme("INFO", "Raspberry", f"Broadcast reçu : {message}")

def client_subscriptions(client):
    client.subscribe("esp8266/#")
    client.subscribe("rpi/broadcast")

# ─── DÉMARRAGE ────────────────────────────────────────────────

init_db()

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, 'rpi_client1')
flag_connected = 0

client.on_connect    = on_connect
client.on_disconnect = on_disconnect
client.message_callback_add('esp8266/sensor1',  callback_esp32_sensor1)
client.message_callback_add('rpi/broadcast',  callback_rpi_broadcast)

try:
    client.connect(MQTT_BROKER, MQTT_PORT)
    client.loop_start() # Démarre le thread MQTT en arrière-plan
    client_subscriptions(client)
    print("......client setup complete............")
except Exception as e:
    print(f"❌ Erreur connexion Broker : {e}")

# Lancement du serveur Web Flask
if __name__ == '__main__':
    print("🚀 Serveur Web Flask en cours d'exécution sur le port 5000...")
    # app.run() bloque le script ici et gère les requêtes indéfiniment. 
    # Plus besoin de 'while True' !
    app.run(host='0.0.0.0', port=5000, debug=False)