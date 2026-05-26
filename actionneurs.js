document.addEventListener("DOMContentLoaded", () => {

    const brokerUrl = 'ws://192.168.4.2:9001';
    let client = null;

    // ====================================================
    // MQTT
    // ====================================================
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

                // Capteurs
                client.subscribe('esp8266/sensors/temperature');
                client.subscribe('esp8266/sensors/humidite_sol');
                client.subscribe('esp8266/sensors/luminosite');
                client.subscribe('esp8266/sensors/humidite_air');

                // Etats actionneurs
                client.subscribe('esp8266/status/pompe');
                client.subscribe('esp8266/status/ventilo');
                client.subscribe('esp8266/status/led');
            });

            client.on('message', (topic, message) => {

                const valeur = message.toString();

                // =========================
                // CAPTEURS
                // =========================
                if (topic === 'esp8266/sensors/temperature') {
                    updateSensor('temperature', parseFloat(valeur));
                }

                else if (topic === 'esp8266/sensors/humidite_sol') {
                    updateSensor('humidite_sol', parseFloat(valeur));
                }

                else if (topic === 'esp8266/sensors/luminosite') {
                    updateSensor('luminosite', parseFloat(valeur));
                }

                else if (topic === 'esp8266/sensors/humidite_air') {
                    updateSensor('humidite_air', parseFloat(valeur));
                }

                // =========================
                // ACTIONNEURS
                // =========================
                else if (topic === 'esp8266/status/pompe') {
                    setActionneurState('pompe', valeur === "ON");
                }

                else if (topic === 'esp8266/status/ventilo') {
                    setActionneurState('ventilo', valeur === "ON");
                }

                else if (topic === 'esp8266/status/led') {
                    setActionneurState('led', valeur === "ON");
                }
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

    // ====================================================
    // VALEURS CAPTEURS
    // ====================================================
    const state = {
        sensors: {
            temperature: {
                value: 0,
                unite: '°C',
                min: 13,
                max: 35,
                sMin: 18.5,
                sMax: 26.5,
                label: 'Température'
            },

            humidite_air: {
                value: 0,
                unite: '%',
                min: 40,
                max: 90,
                sMin: 60,
                sMax: 80,
                label: 'Humidité Air'
            },

            luminosite: {
                value: 0,
                unite: ' lux',
                min: 7000,
                max: 25000,
                sMin: 10000,
                sMax: 20000,
                label: 'Luminosité'
            },

            humidite_sol: {
                value: 0,
                unite: '%',
                min: 40,
                max: 90,
                sMin: 40,
                sMax: 80,
                label: 'Humidité Sol'
            },
        },

        alertes: [],
    };

    // ====================================================
    // VERIF STATUT
    // ====================================================
    function getStatut(type, val) {

        const s = state.sensors[type];

        if (val < s.min || val > s.max) {
            return 'critique';
        }

        if (val < s.sMin || val > s.sMax) {
            return 'alerte';
        }

        return 'normal';
    }

    // ====================================================
    // ACTIONNEURS
    // ====================================================
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

    let autoMode = true;

    const btnAuto = document.getElementById('btn-auto');
    const btnManuel = document.getElementById('btn-manuel');
    const logBody = document.getElementById('commandes-body');

    // ====================================================
    // LOGS
    // ====================================================
    function addLog(name, action, source) {

        if (!logBody) return;

        const row = document.createElement('tr');

        row.innerHTML = `
            <td><strong>${name}</strong></td>
            <td>${action}</td>
            <td>${source}</td>
            <td>${new Date().toLocaleTimeString('fr-FR')}</td>
        `;

        logBody.insertBefore(row, logBody.firstChild);
    }

    // ====================================================
    // MODES
    // ====================================================
    function setMode(auto) {

        autoMode = auto;

        if (auto) {
            btnAuto.classList.add('active');
            btnManuel.classList.remove('active');
        }

        else {
            btnAuto.classList.remove('active');
            btnManuel.classList.add('active');
        }

        Object.values(actionneurs).forEach(a => {
            if (a.btn) {
                a.btn.disabled = auto;
            }
        });

        addLog(
            "SYSTEME",
            "Mode " + (auto ? "Automatique" : "Manuel"),
            "Interface"
        );
    }

    if (btnAuto) btnAuto.onclick = () => setMode(true);
    if (btnManuel) btnManuel.onclick = () => setMode(false);

    // ====================================================
    // UPDATE UI ACTIONNEURS
    // ====================================================
    function setActionneurState(key, isOn) {

        const a = actionneurs[key];

        if (!a) return;

        a.active = isOn;

        a.state.textContent = isOn ? "ALLUME" : "ETEINT";

        if (a.btn) {
            a.btn.textContent = isOn ? "DESACTIVER" : "ACTIVER";
        }

        if (a.card) {
            a.card.classList.toggle('on', isOn);
        }

        if (a.btn) {
            a.btn.classList.toggle('on', isOn);
        }
    }

    // ====================================================
    // ACTION MANUELLE
    // ====================================================
    function toggle(key) {

        if (autoMode) return;

        const a = actionneurs[key];

        if (!a) return;

        a.active = !a.active;

        const payload = a.active ? "ON" : "OFF";

        if (client && client.connected) {

            client.publish(a.topic, payload);

            console.log(`MQTT envoyé : ${a.topic} -> ${payload}`);
        }

        setActionneurState(key, a.active);

        addLog(
            a.name,
            a.active ? "Allumage" : "Extinction",
            "Manuel"
        );
    }

    if (actionneurs.pompe.btn) {
        actionneurs.pompe.btn.onclick = () => toggle('pompe');
    }

    if (actionneurs.ventilo.btn) {
        actionneurs.ventilo.btn.onclick = () => toggle('ventilo');
    }

    if (actionneurs.led.btn) {
        actionneurs.led.btn.onclick = () => toggle('led');
    }

    // ====================================================
    // UPDATE CAPTEURS
    // ====================================================
    function updateSensor(type, value) {

        if (!state.sensors[type]) return;

        state.sensors[type].value = value;

        console.log(`[Donnée reçue] ${type} = ${value}`);

        const statut = getStatut(type, value);

        console.log(`Statut ${type} : ${statut}`);
    }
});