"""
server.py — Backend Flask pour SIC (Serre Intelligente Connectée)
Fait le pont entre SIC_base_de_donnees.db (SQLite) et le front HTML.

Table réelle utilisée :
    mesure(id, capteurs_id, valeur, timestamp, statut)

Table capteurs attendue (pour récupérer le type/nom du capteur) :
    capteurs(id, type)
    -- type vaut : 'temperature' | 'humidite_air' | 'luminosite' | 'humidite_sol'

Si tu n'as pas de table capteurs, remplis le dict CAPTEURS_MAP ci-dessous
avec tes capteurs_id réels, par exemple :
    CAPTEURS_MAP = {1: "temperature", 2: "humidite_air", 3: "luminosite", 4: "humidite_sol"}

Lancement :
    pip install flask flask-cors
    python server.py
"""

import sqlite3
import os
from flask import Flask, jsonify, request, g
from flask_cors import CORS

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH  = "/home/admin123/SIC_base_de_donnees.db"
MAX_ROWS = 500
HOST     = "0.0.0.0"
PORT     = 5001

# ── Mapping de secours capteurs_id → type (si pas de table capteurs) ─────────
# Remplis avec tes vrais IDs si nécessaire.
CAPTEURS_MAP = {
    1: "temperature",
    2: "humidite_air",
    3: "luminosite",
    4: "humidite_sol",
}

# ── Labels, unités, seuils ────────────────────────────────────────────────────
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

SEUILS = {
    "temperature":  dict(min=5,   max=40,    sMin=15,  sMax=30),
    "humidite_air": dict(min=20,  max=95,    sMin=40,  sMax=80),
    "luminosite":   dict(min=100, max=65535, sMin=500, sMax=10000),
    "humidite_sol": dict(min=10,  max=100,   sMin=30,  sMax=90),
}

# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)


# ── DB helpers ────────────────────────────────────────────────────────────────
def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_db(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()


def resolve_type(db, capteurs_id):
    """
    Récupère le type du capteur depuis la table 'capteurs' si elle existe,
    sinon utilise le dict CAPTEURS_MAP comme fallback.
    """
    try:
        row = db.execute(
            "SELECT type FROM capteurs WHERE id = ?", (capteurs_id,)
        ).fetchone()
        if row:
            return row["type"]
    except sqlite3.OperationalError:
        pass  # table capteurs inexistante → fallback
    return CAPTEURS_MAP.get(capteurs_id, f"capteur_{capteurs_id}")


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/api/historique")
def api_historique():
    """
    GET /api/historique?limit=500&type=temperature
    Retourne les N dernières lignes de la table 'mesure',
    triées du plus récent au plus ancien.
    """
    limit       = min(int(request.args.get("limit", MAX_ROWS)), MAX_ROWS)
    type_filter = request.args.get("type", None)   # ex: 'temperature'

    db = get_db()

    # Résout d'abord les capteurs_id filtrés si un type est demandé
    if type_filter:
        # Trouve tous les capteurs_id correspondant à ce type
        ids_filtres = [cid for cid, t in CAPTEURS_MAP.items() if t == type_filter]
        # Tente aussi via la table capteurs
        try:
            rows_cap = db.execute(
                "SELECT id FROM capteurs WHERE type = ?", (type_filter,)
            ).fetchall()
            ids_filtres += [r["id"] for r in rows_cap]
        except sqlite3.OperationalError:
            pass
        ids_filtres = list(set(ids_filtres))

        if not ids_filtres:
            return jsonify([])

        placeholders = ",".join("?" * len(ids_filtres))
        rows = db.execute(
            f"SELECT * FROM mesures WHERE capteurs_id IN ({placeholders})"
            f" ORDER BY timestamp DESC LIMIT ?",
            (*ids_filtres, limit),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM mesures ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()

    result = []
    for r in rows:
        capteurs_id = r["capteurs_id"]
        type_       = resolve_type(db, capteurs_id)
        val         = r["valeur"]
        statut      = r["statut"]   # déjà stocké en DB

        result.append({
            "id":          r["id"],
            "capteurs_id": capteurs_id,
            "type":        type_,
            "label":       LABELS.get(type_, f"Capteur {capteurs_id}"),
            "val":         val,
            "unite":       UNITES.get(type_, ""),
            "statut":      statut,
            "ts":          r["timestamp"],
        })

    return jsonify(result)


@app.route("/api/statut")
def api_statut():
    """Vérifie que le serveur et la DB sont accessibles."""
    try:
        db = get_db()
        nb = db.execute("SELECT COUNT(*) FROM mesure").fetchone()[0]
        return jsonify({"ok": True, "nb_mesures": nb})
    except Exception as e:
        return jsonify({"ok": False, "erreur": str(e)}), 500


# ── Point d'entrée ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"✅  Serveur SIC démarré sur http://localhost:{PORT}")
    print(f"📂  Base de données : {DB_PATH}")
    app.run(host=HOST, port=PORT, debug=True)