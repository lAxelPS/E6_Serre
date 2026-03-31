const state = {
  sensors: {
    temperature:  { value: 0, unite: '°C',  min: 13,   max: 35,    sMin: 18.5,  sMax: 26.5   },
    humidite_air: { value: 0, unite: '%',   min: 40,  max: 90,    sMin: 60,  sMax: 80   },
    luminosite:   { value: 0, unite: 'lux', min: 7000, max: 25000, sMin: 10000, sMax: 20000 },
    humidite_sol: { value: 0, unite: '%',   min: 40,  max: 90,   sMin: 40,  sMax: 80   },
  },
  acteurs: { pompe: false, ventilo: false, led: false },
  mode: 'manuel',
  commandes: [],
  alertes: [],
};

// Initialisation des données démo (pour les historiques en attendant une API complète)
(function initDemo() {
  const now = Date.now();
  state.commandes = [
    { nom:'Arrosage', action:'OFF', source:'automatique', ts: new Date(now - 3300000).toLocaleString('fr-FR') },
    { nom:'Ventilation', action:'ON', source:'manuel', ts: new Date(now - 1800000).toLocaleString('fr-FR') },
  ];
  state.alertes = [
    { capteur:'🌡️ Température', niveau:'avertissement', message:'Température > 30°C', ts:'il y a 12 min' },
  ];
})();

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
    if (!el) return; // Si l'élément n'existe pas sur la page actuelle, on passe au suivant

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

// ─── CONNEXION AVEC PYTHON (FLASK) ───────────────────────────
async function refreshData() {
  try {
    // ⚠️ Remplace 'localhost' par l'IP de ton Raspberry si tu n'es pas sur la même machine
    const response = await fetch('http://localhost:5000/api/data');
    
    if (!response.ok) throw new Error("Erreur réseau ou serveur injoignable");
    
    const data = await response.json();

    // Mise à jour du state avec les clés reçues du JSON de l'ESP32
    state.sensors.temperature.value  = data.temperature;
    state.sensors.humidite_air.value = data.humidity;
    state.sensors.luminosite.value   = data.lux;
    state.sensors.humidite_sol.value = data.soil;

    // Rafraîchir l'interface
    updateDashboard();

    // Optionnel : Mettre à jour la pastille MQTT (si elle existe sur la page)
    const mqttLabel = document.getElementById('mqtt-label');
    if (mqttLabel) mqttLabel.textContent = "MQTT connecté (En direct)";

  } catch (error) {
    console.error("Impossible de récupérer les données :", error);
    // Optionnel : Indiquer visuellement que la connexion est perdue
    const mqttLabel = document.getElementById('mqtt-label');
    if (mqttLabel) mqttLabel.textContent = "Erreur de connexion serveur";
  }
}
// ─────────────────────────────────────────────────────────────

function syncActeurCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const on = state.acteurs[id];
  card.className = `actionneur-card ${on ? 'on' : ''}`;
  document.getElementById(`state-${id}`).textContent = on ? 'ALLUMÉ' : 'ÉTEINT';
  const btn = document.getElementById(`btn-${id}`);
  btn.textContent = on ? 'DÉSACTIVER' : 'ACTIVER';
  btn.className = `toggle-btn ${on ? 'on' : ''}`;
}

function renderCommandes() {
  const body = document.getElementById('commandes-body');
  if (!body) return;
  body.innerHTML = state.commandes.slice(0, 10).map(c => `
    <tr><td>${c.nom}</td><td style="color:${c.action==='ON'?'var(--green)':'var(--red)'}">${c.action}</td>
    <td><span class="badge normal">${c.source}</span></td><td>${c.ts}</td></tr>
  `).join('');
}

function toggleActeur(id) {
  if (state.mode === 'auto') return;
  state.acteurs[id] = !state.acteurs[id];
  syncActeurCard(id);
  state.commandes.unshift({ nom: id, action: state.acteurs[id]?'ON':'OFF', source: 'manuel', ts: new Date().toLocaleTimeString() });
  renderCommandes();
}

function setMode(m) {
  state.mode = m;
  const btnM = document.getElementById('btn-manuel');
  const btnA = document.getElementById('btn-auto');
  if (btnM) btnM.className = `mode-btn ${m === 'manuel' ? 'active' : ''}`;
  if (btnA) btnA.className = `mode-btn ${m === 'auto' ? 'active' : ''}`;
}

// Initialisation des événements
document.addEventListener('DOMContentLoaded', () => {
  // Rafraîchissement manuel
  const btnRefresh = document.getElementById('refresh-dashboard');
  if (btnRefresh) btnRefresh.addEventListener('click', () => refreshData());

  ['pompe', 'ventilo', 'led'].forEach(id => {
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.addEventListener('click', () => toggleActeur(id));
  });

  const bM = document.getElementById('btn-manuel');
  if (bM) bM.addEventListener('click', () => setMode('manuel'));
  const bA = document.getElementById('btn-auto');
  if (bA) bA.addEventListener('click', () => setMode('auto'));

  setInterval(() => {
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('fr-FR');
  }, 1000);

  // Appels initiaux
  updateDashboard();
  renderCommandes();
  ['pompe', 'ventilo', 'led'].forEach(syncActeurCard);

  // Lancement de la récupération automatique des données (toutes les 5 secondes)
  refreshData();
  setInterval(refreshData, 5000);
});