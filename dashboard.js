const state = {
  sensors: {
    temperature:  { value: 0, unite: '°C',  min: 13,   max: 35,    sMin: 18.5,  sMax: 26.5   },
    humidite_air: { value: 0, unite: '%',   min: 40,  max: 90,    sMin: 60,  sMax: 80   },
    luminosite:   { value: 0, unite: 'lux', min: 7000, max: 25000, sMin: 10000, sMax: 20000 },
    humidite_sol: { value: 0, unite: '%',   min: 40,  max: 90,   sMin: 40,  sMax: 80   },
  },
  acteurs: { pompe: false, ventilo: false, led: false },
  mode: 'manuel',
  commandes: [], // Historique vide au démarrage
  alertes: [],   // Alertes vides au démarrage
};

// 2. Fonctions Capteurs & Dashboard
function getStatut(type, val) {
  const s = state.sensors[type];
  if (val < s.min || val > s.max) return 'critique';
  if (val < s.sMin || val > s.sMax) return 'alerte';
  return 'normal';
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

// 3. Connexion avec Python (Flask / API)
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

    const mqttLabel = document.getElementById('mqtt-label');
    if (mqttLabel) mqttLabel.textContent = "MQTT connecté (En direct)";

  } catch (error) {
    console.error("Impossible de récupérer les données :", error);
    const mqttLabel = document.getElementById('mqtt-label');
    if (mqttLabel) mqttLabel.textContent = "Erreur de connexion serveur";
  }
}

// 4. Initialisation principale
document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('refresh-dashboard');
  if (btnRefresh) btnRefresh.addEventListener('click', () => refreshData());

  setInterval(() => {
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('fr-FR');
  }, 1000);

  updateDashboard();
  refreshData();
  setInterval(refreshData, 5000); // Rafraîchissement automatique
});
