document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Configuration MQTT (WebSockets sur Port 9001) ---
    const brokerUrl = 'ws://127.0.0.1:9001'; 
    const topicBroadcast = "rpi/broadcast";
    const client = mqtt.connect(brokerUrl);

    client.on('connect', () => console.log("Connecté au broker MQTT (WS)"));

    // --- 2. Horloge ---
    const clockEl = document.getElementById('clock');
    const updateClock = () => { clockEl.textContent = new Date().toLocaleTimeString('fr-FR'); };
    setInterval(updateClock, 1000);
    updateClock();

    // --- 3. DOM & Actionneurs ---
    const btnManuel = document.getElementById('btn-manuel');
    const btnAuto = document.getElementById('btn-auto');
    const logBody = document.getElementById('commandes-body');

    const actionneurs = {
        pompe: { name: 'Arrosage', btn: document.getElementById('btn-pompe'), stateText: document.getElementById('state-pompe'), isActive: false },
        ventilo: { name: 'Ventilation', btn: document.getElementById('btn-ventilo'), stateText: document.getElementById('state-ventilo'), isActive: false },
        led: { name: 'Éclairage LED', btn: document.getElementById('btn-led'), stateText: document.getElementById('state-led'), isActive: false }
    };

    let isAutoMode = false;

    function addLog(actionneur, action, source) {
        const row = document.createElement('tr');
        row.innerHTML = `<td><strong>${actionneur}</strong></td><td>${action}</td><td>${source}</td><td>${new Date().toLocaleTimeString('fr-FR')}</td>`;
        logBody.insertBefore(row, logBody.firstChild);
    }

    // --- 4. Gestion des Modes ---
    function setMode(auto) {
        isAutoMode = auto;
        btnAuto.classList.toggle('active', auto);
        btnManuel.classList.toggle('active', !auto);
        Object.values(actionneurs).forEach(act => act.btn.disabled = auto);
        addLog('Système', `Mode ${auto ? 'Automatique' : 'Manuel'} ACTIVÉ`, 'Interface');
    }

    btnAuto.addEventListener('click', () => setMode(true));
    btnManuel.addEventListener('click', () => setMode(false));

    // --- 5. Logique de clic ---
    function toggleActionneur(key) {
        if (isAutoMode) return;
        const act = actionneurs[key];
        act.isActive = !act.isActive;

        // Si on clique sur le bouton LED, on pilote le ventilateur via MQTT
        if (key === 'led') {
            const payload = act.isActive ? "FAN_ON" : "FAN_OFF";
            if (client.connected) client.publish(topicBroadcast, payload);
        }

        // Mise à jour visuelle
        act.stateText.textContent = act.isActive ? 'ALLUMÉ' : 'ÉTEINT';
        act.btn.textContent = act.isActive ? 'DÉSACTIVER' : 'ACTIVER';
        act.stateText.style.color = act.isActive ? '#4ade80' : '';
        addLog(act.name, act.isActive ? 'Allumage' : 'Extinction', 'Mode Manuel');
    }

    actionneurs.pompe.btn.addEventListener('click', () => toggleActionneur('pompe'));
    actionneurs.ventilo.btn.addEventListener('click', () => toggleActionneur('ventilo'));
    actionneurs.led.btn.addEventListener('click', () => toggleActionneur('led'));
});