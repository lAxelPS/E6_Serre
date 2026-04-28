document.addEventListener("DOMContentLoaded", () => {

    const brokerUrl = 'ws://192.168.4.2:9001'; // ⚠️ IP ESP8266 AP (à adapter)

    let client = null;

    // ── MQTT sécurisé ─────────────────────────────
    if (typeof mqtt !== "undefined") {

        try {
            client = mqtt.connect(brokerUrl);

            client.on('connect', () => {
                console.log("✅ MQTT connecté");
            });

            client.on('error', (err) => {
                console.error("❌ MQTT erreur :", err);
            });

            client.on('offline', () => {
                console.warn("⚠️ MQTT offline");
            });

        } catch (e) {
            console.error("❌ Impossible d'initialiser MQTT :", e);
        }

    } else {
        console.error("❌ mqtt.min.js NON chargé !");
    }

    // ── Horloge ─────────────────────────────────
    const clockEl = document.getElementById('clock');
    setInterval(() => {
        clockEl.textContent = new Date().toLocaleTimeString('fr-FR');
    }, 1000);

    // ── Actionneurs ─────────────────────────────
    const actionneurs = {
        pompe: {
            name: 'Arrosage',
            topic: 'esp8266/cmd/pompe',
            btn: document.getElementById('btn-pompe'),
            state: document.getElementById('state-pompe'),
            active: false
        },
        ventilo: {
            name: 'Ventilation',
            topic: 'esp8266/cmd/ventilo',
            btn: document.getElementById('btn-ventilo'),
            state: document.getElementById('state-ventilo'),
            active: false
        },
        led: {
            name: 'LED',
            topic: 'esp8266/cmd/led',
            btn: document.getElementById('btn-led'),
            state: document.getElementById('state-led'),
            active: false
        }
    };

    let autoMode = false;

    // ── Mode ────────────────────────────────────
    document.getElementById('btn-auto').onclick = () => setMode(true);
    document.getElementById('btn-manuel').onclick = () => setMode(false);

    function setMode(auto) {
        autoMode = auto;
        Object.values(actionneurs).forEach(a => a.btn.disabled = auto);
        console.log("Mode :", auto ? "AUTO" : "MANUEL");
    }

    // ── Toggle ──────────────────────────────────
    function toggle(key) {

        if (autoMode) return;

        const a = actionneurs[key];
        a.active = !a.active;

        const payload = a.active ? "ON" : "OFF";

        // MQTT
        if (client && client.connected) {
            client.publish(a.topic, payload);
            console.log("MQTT envoyé :", a.topic, payload);
        } else {
            console.warn("MQTT non connecté");
        }

        // UI (TOUJOURS fonctionnelle)
        a.state.textContent = a.active ? "ALLUMÉ" : "ÉTEINT";
        a.btn.textContent = a.active ? "DÉSACTIVER" : "ACTIVER";
    }

    actionneurs.pompe.btn.onclick = () => toggle('pompe');
    actionneurs.ventilo.btn.onclick = () => toggle('ventilo');
    actionneurs.led.btn.onclick = () => toggle('led');

});