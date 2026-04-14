document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Gestion de l'horloge ---
    const clockEl = document.getElementById('clock');
    const updateClock = () => {
        clockEl.textContent = new Date().toLocaleTimeString('fr-FR');
    };
    setInterval(updateClock, 1000);
    updateClock(); // Initialisation immédiate

    // --- 2. Récupération des éléments du DOM ---
    const btnManuel = document.getElementById('btn-manuel');
    const btnAuto = document.getElementById('btn-auto');
    const logBody = document.getElementById('commandes-body');

    // Configuration des actionneurs pour centraliser la gestion
    const actionneurs = {
        pompe: {
            name: 'Arrosage',
            btn: document.getElementById('btn-pompe'),
            stateText: document.getElementById('state-pompe'),
            isActive: false
        },
        ventilo: {
            name: 'Ventilation',
            btn: document.getElementById('btn-ventilo'),
            stateText: document.getElementById('state-ventilo'),
            isActive: false
        },
        led: {
            name: 'Éclairage LED',
            btn: document.getElementById('btn-led'),
            stateText: document.getElementById('state-led'),
            isActive: false
        }
    };

    let isAutoMode = false;

    // --- 3. Fonction pour écrire dans le journal ---
    function addLog(actionneur, action, source) {
        const row = document.createElement('tr');
        const time = new Date().toLocaleTimeString('fr-FR');
        
        row.innerHTML = `
            <td><strong>${actionneur}</strong></td>
            <td>${action}</td>
            <td>${source}</td>
            <td>${time}</td>
        `;
        
        // On ajoute la nouvelle ligne tout en haut du tableau
        logBody.insertBefore(row, logBody.firstChild);
    }

    // --- 4. Gestion des modes (Manuel / Auto) ---
    function setMode(auto) {
        if (isAutoMode === auto) return; // On ne fait rien si on est déjà dans ce mode
        isAutoMode = auto;

        if (isAutoMode) {
            // Mode Automatique
            btnAuto.classList.add('active');
            btnManuel.classList.remove('active');
            
            // Rendre les boutons incliquables
            Object.values(actionneurs).forEach(act => act.btn.disabled = true);
            
            addLog('Système', 'Passage en mode Automatique', 'Interface Utilisateur');
        } else {
            // Mode Manuel
            btnManuel.classList.add('active');
            btnAuto.classList.remove('active');
            
            // Rendre les boutons à nouveau cliquables
            Object.values(actionneurs).forEach(act => act.btn.disabled = false);
            
            addLog('Système', 'Passage en mode Manuel', 'Interface Utilisateur');
        }
    }

    // Écouteurs d'événements pour les boutons de mode
    btnAuto.addEventListener('click', () => setMode(true));
    btnManuel.addEventListener('click', () => setMode(false));

    // --- 5. Gestion des clics sur les actionneurs ---
    function toggleActionneur(key) {
        if (isAutoMode) return; // Sécurité supplémentaire si on est en mode auto

        const act = actionneurs[key];
        act.isActive = !act.isActive; // On inverse l'état

        if (act.isActive) {
            act.stateText.textContent = 'ALLUMÉ';
            act.stateText.style.color = '#4ade80'; // Petite touche de couleur verte
            act.btn.textContent = 'DÉSACTIVER';
            addLog(act.name, 'Allumé', 'Manuel');
        } else {
            act.stateText.textContent = 'ÉTEINT';
            act.stateText.style.color = ''; // Retour à la couleur par défaut
            act.btn.textContent = 'ACTIVER';
            addLog(act.name, 'Éteint', 'Manuel');
        }
    }

    // Écouteurs d'événements pour les boutons des actionneurs
    actionneurs.pompe.btn.addEventListener('click', () => toggleActionneur('pompe'));
    actionneurs.ventilo.btn.addEventListener('click', () => toggleActionneur('ventilo'));
    actionneurs.led.btn.addEventListener('click', () => toggleActionneur('led'));
});