document.addEventListener("DOMContentLoaded", () => {

    const brokerUrl = 'ws://192.168.4.2:9001'; 
    let client = null;

    // -- MQTT --
    if (typeof mqtt !== "undefined") {
        try {
            client = mqtt.connect(brokerUrl);

            const mqttDot = document.getElementById('mqtt-dot');

            function setMqttStatus(isOn) {
                if (!mqttDot) return;
                mqttDot.classList.toggle('off', !isOn);
            }

            client.on('connect', () => {
                console.log("OK : MQTT connecte");
                setMqttStatus(true);
            });

            client.on('error', (err) => {
                console.error("ERR : MQTT erreur", err);
                setMqttStatus(false);
            });

            client.on('offline', () => {
                console.warn("WARN : MQTT offline");
                setMqttStatus(false);
            });

        } catch (e) {
            console.error("ERR : Impossible d'initialiser MQTT", e);
        }
    } else {
        console.error("ERR : mqtt.min.js NON charge");
    }

    // -- Valeurs --
    const state = {
    sensors: {
        temperature:  { value: 0, unite: '°C',  min: 13,   max: 35,    sMin: 18.5,  sMax: 26.5,  label: '🌡️ Température' },
        humidite_air: { value: 0, unite: '%',   min: 40,   max: 90,    sMin: 60,    sMax: 80,    label: '💧 Humidité Air' },
        luminosite:   { value: 0, unite: ' lux', min: 7000, max: 25000, sMin: 10000, sMax: 20000, label: '☀️ Luminosité' },
        humidite_sol: { value: 0, unite: '%',   min: 40,   max: 90,    sMin: 40,    sMax: 80,    label: '🌱 Humidité Sol' },
    },
    alertes: [],
    };

    // Vérifie les seuils et retourne le statut
    function getStatut(type, val) {
        const s = state.sensors[type];
        if (val < s.min || val > s.max) return 'critique';
        if (val < s.sMin || val > s.sMax) return 'alerte';
    return 'normal';
    }

    // -- Actionneurs --
    const actionneurs = {
        pompe: {
            name: 'Arrosage',
            topic: 'esp8266/cmd/pompe',
            btn: document.getElementById('btn-pompe'),
            state: document.getElementById('state-pompe'),
            card: document.getElementById('card-pompe'),
            active: false
        },
        ventilo: {
            name: 'Ventilation',
            topic: 'esp8266/cmd/ventilo',
            btn: document.getElementById('btn-ventilo'),
            state: document.getElementById('state-ventilo'),
            card: document.getElementById('card-ventilo'),
            active: false
        },
        led: {
            name: 'LED',
            topic: 'esp8266/cmd/led',
            btn: document.getElementById('btn-led'),
            state: document.getElementById('state-led'),
            card: document.getElementById('card-led'),
            active: false
        }
    };

    let autoMode = false;
    const btnAuto = document.getElementById('btn-auto');
    const btnManuel = document.getElementById('btn-manuel');
    const logBody = document.getElementById('commandes-body');

    // -- Journal --
    function addLog(name, action, source) {
        if (!logBody) return;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${name}</strong></td>
            <td>${action}</td>
            <td>${source}</td>
            <td>${new Date().toLocaleTimeString('fr-FR')}</td>`;
        logBody.insertBefore(row, logBody.firstChild);
    }

    // -- Gestion des Modes --
    function setMode(auto) {
    if (autoMode === auto) return; // ⛔ déjà dans ce mode → on ignore

    autoMode = auto;

    if (auto) {
        btnAuto.classList.add('active');
        btnManuel.classList.remove('active');
    } else {
        btnAuto.classList.remove('active');
        btnManuel.classList.add('active');
    }

    Object.values(actionneurs).forEach(a => {
        if (a.btn) a.btn.disabled = auto;
    });

    addLog("SYSTEME", "Mode " + (auto ? "Automatique" : "Manuel"), "Interface");
    }

    if (btnAuto) btnAuto.onclick = () => setMode(true);
    if (btnManuel) btnManuel.onclick = () => setMode(false);

    // -- Toggle --
    function toggle(key) {
        if (autoMode) return;

        const a = actionneurs[key];
        if (!a || !a.btn) return;

        a.active = !a.active;
        const payload = a.active ? "ON" : "OFF";

        if (client && client.connected) {
            client.publish(a.topic, payload);
        }

        a.state.textContent = a.active ? "ALLUME" : "ETEINT";
        a.btn.textContent = a.active ? "DESACTIVER" : "ACTIVER";
        
        if (a.card) a.card.classList.toggle('on', a.active);
        if (a.btn) a.btn.classList.toggle('on', a.active);

        addLog(a.name, a.active ? "Allumage" : "Extinction", "Manuel");
    }

    if (actionneurs.pompe.btn) actionneurs.pompe.btn.onclick = () => toggle('pompe');
    if (actionneurs.ventilo.btn) actionneurs.ventilo.btn.onclick = () => toggle('ventilo');
    if (actionneurs.led.btn) actionneurs.led.btn.onclick = () => toggle('led');

});