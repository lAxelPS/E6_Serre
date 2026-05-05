const state = {
  sensors: {
    temperature:  { value: 0, unite: '°C',  min: 13,   max: 35,    sMin: 18.5,  sMax: 26.5,  label: '🌡️ Température' },
    humidite_air: { value: 0, unite: '%',   min: 40,   max: 90,    sMin: 60,    sMax: 80,    label: '💧 Humidité Air' },
    luminosite:   { value: 0, unite: ' lux', min: 7000, max: 25000, sMin: 10000, sMax: 20000, label: '☀️ Luminosité' },
    humidite_sol: { value: 0, unite: '%',   min: 40,   max: 90,    sMin: 40,    sMax: 80,    label: '🌱 Humidité Sol' },
  },
  alertes: [],
};

document.addEventListener("DOMContentLoaded", () => {

    const brokerUrl = 'ws://192.168.4.2:9001'; 
    const mqttDot = document.getElementById('mqtt-dot');

    function setMqttStatus(isOn) {
        if (!mqttDot) return;
        mqttDot.classList.toggle('off', !isOn);
    }

    if (typeof mqtt === "undefined") {
        console.error("ERR : mqtt.min.js NON charge");
        setMqttStatus(false);
        return;
    }

    try {
        const client = mqtt.connect(brokerUrl);

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
        setMqttStatus(false);
    }

});

// Vérifie les seuils et retourne le statut
function getStatut(type, val) {
  const s = state.sensors[type];
  if (val < s.min || val > s.max) return 'critique';
  if (val < s.sMin || val > s.sMax) return 'alerte';
  return 'normal';
}

// Génère la liste des alertes en fonction des valeurs actuelles
function checkAlertes() {
  state.alertes = []; // On vide les anciennes alertes
  const now = new Date().toLocaleTimeString('fr-FR');

  Object.entries(state.sensors).forEach(([type, s]) => {
    const statut = getStatut(type, s.value);
    
    if (statut !== 'normal') {
      let message = '';
      const displayValue = type === 'luminosite' ? Math.round(s.value) : s.value.toFixed(1);
      
      if (s.value < s.min || s.value < s.sMin) {
        message = `${s.label} trop basse (${displayValue}${s.unite})`;
      } else {
        message = `${s.label} trop haute (${displayValue}${s.unite})`;
      }

      state.alertes.push({
        capteur: s.label,
        niveau: statut === 'alerte' ? 'avertissement' : 'critique', // 'avertissement' pour matcher la classe CSS de ta démo
        message: message,
        ts: now
      });
    }
  });
}

function updateDashboard() {
  const map = {
    temperature:  { val: 'val-temp',  bar: 'bar-temp',  badge: 'badge-temp',  card: 'card-temperature' },
    humidite_air: { val: 'val-hum',   bar: 'bar-hum',   badge: 'badge-hum',   card: 'card-humidite_air' },
    luminosite:   { val: 'val-lux',   bar: 'bar-lux',   badge: 'badge-lux',   card: 'card-luminosite' },
    humidite_sol: { val: 'val-sol',   bar: 'bar-sol',   badge: 'badge-sol',   card: 'card-humidite_sol' },
  };

  Object.entries(map).forEach(([type, ids]) => {
    const el = document.getElementById(ids.val);
    if (!el) return;

    const s = state.sensors[type];
    const statut = getStatut(type, s.value);
    const p = Math.max(0, Math.min(100, (s.value - s.min) / (s.max - s.min) * 100));

    el.innerHTML = `${type === 'luminosite' ? Math.round(s.value) : s.value.toFixed(1)}<span class="unit">${s.unite}</span>`;
    document.getElementById(ids.bar).style.width = `${p}%`;
    document.getElementById(ids.badge).textContent = statut;
    document.getElementById(ids.card).className = `sensor-card ${statut === 'normal' ? '' : statut}`;
  });

  // On met à jour les alertes dynamiquement à chaque refresh
  checkAlertes();
  renderAlertes();
}

function renderAlertes() {
  const box = document.getElementById('alertes-list');
  if (!box) return;
  if (!state.alertes.length) {
    box.innerHTML = '<div class="no-alerte">✔ Aucune alerte active</div>';
    return;
  }
  box.innerHTML = state.alertes.map(a => `
    <div class="alerte-row">
      <span class="alerte-niveau ${a.niveau}">${a.niveau.toUpperCase()}</span>
      <span class="alerte-msg">${a.message}</span>
      <span class="alerte-ts">${a.ts}</span>
    </div>
  `).join('');
}

// ─── CONNEXION AVEC PYTHON (FLASK) ───────────────────────────
async function refreshData() {
  try {
    const response = await fetch('http://localhost:5000/api/data');
    if (!response.ok) throw new Error("Erreur réseau ou serveur injoignable");
    
    const data = await response.json();

    state.sensors.temperature.value  = data.temperature;
    state.sensors.humidite_air.value = data.humidity;
    state.sensors.luminosite.value   = data.lux;
    state.sensors.humidite_sol.value = data.soil;

    updateDashboard();

    const mqttLabel = document.querySelector('.sidebar-status span');
    if (mqttLabel) mqttLabel.textContent = "MQTT connecté";

  } catch (error) {
    console.error("Impossible de récupérer les données :", error);
    const mqttLabel = document.querySelector('.sidebar-status span');
    if (mqttLabel) mqttLabel.textContent = "Erreur de connexion";
  }
}
// ─────────────────────────────────────────────────────────────

// Initialisation des événements
document.addEventListener('DOMContentLoaded', () => {
  // Horloge
  setInterval(() => {
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('fr-FR');
  }, 1000);

  // Appels initiaux
  updateDashboard();

  // Lancement de la récupération automatique des données (toutes les 5 secondes)
  refreshData();
  setInterval(refreshData, 5000);
});