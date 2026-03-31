const state = {
  historique: [],
  filter: 'tous',
};

const labels = {
  temperature: '🌡️ Température',
  humidite_air: '💧 Humidité air',
  luminosite: '☀️ Luminosité',
  humidite_sol: '🌱 Humidité sol',
};

function fmtVal(type, val) {
  return type === 'luminosite' ? Math.round(Number(val)) : Number(val).toFixed(1);
}

function renderHistorique() {
  const data = state.filter === 'tous'
    ? [...state.historique]
    : state.historique.filter(item => item.type === state.filter);

  document.getElementById('historique-body').innerHTML = data.map((h, index) => `
    <tr>
      <td style="color:var(--text-dim)">${index + 1}</td>
      <td>${h.label || labels[h.type] || h.type}</td>
      <td class="val">${fmtVal(h.type, h.val)} ${h.unite}</td>
      <td><span class="badge ${h.statut}">${h.statut}</span></td>
      <td>${h.ts}</td>
    </tr>
  `).join('');
}

function setFilter(filter, button) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  renderHistorique();
}

async function loadHistorique() {
  try {
    // Comportement attendu :
    // cette fonction est appelée une fois à l'ouverture de la page,
    // puis seulement si l'utilisateur clique sur "Recharger l'historique".
    //
    // Exemple backend conseillé :
    // const response = await fetch('/api/historique');
    // const data = await response.json();

    // Démo locale en attendant le vrai backend SQL.
    const types = ['temperature','humidite_air','luminosite','humidite_sol'];
    const unites = { temperature:'°C', humidite_air:'%', luminosite:'lux', humidite_sol:'%' };
    const base = { temperature:22, humidite_air:60, luminosite:3000, humidite_sol:55 };
    const sigma = { temperature:3, humidite_air:10, luminosite:1200, humidite_sol:12 };

    const rows = [];
    const now = Date.now();
    for (let i = 60; i >= 0; i--) {
      const ts = new Date(now - i * 5 * 60000);
      types.forEach(type => {
        const val = +(base[type] + (Math.random() - .5) * sigma[type] * 2).toFixed(1);
        rows.unshift({
          type,
          label: labels[type],
          val,
          unite: unites[type],
          statut: getStatut(type, val),
          ts: ts.toLocaleString('fr-FR'),
        });
      });
    }

    state.historique = rows;
    renderHistorique();
  } catch (error) {
    document.getElementById('historique-body').innerHTML = `
      <tr>
        <td colspan="5">Erreur de chargement de l'historique : ${error.message}</td>
      </tr>
    `;
  }
}

function getStatut(type, val) {
  const seuils = {
    temperature:  { min: 5, max: 40, sMin: 15, sMax: 30 },
    humidite_air: { min: 20, max: 95, sMin: 40, sMax: 80 },
    luminosite:   { min: 100, max: 65535, sMin: 500, sMax: 10000 },
    humidite_sol: { min: 10, max: 100, sMin: 30, sMax: 90 },
  };

  const s = seuils[type];
  if (!s) return 'normal';
  if (val < s.min || val > s.max) return 'critique';
  if (val < s.sMin || val > s.sMax) return 'alerte';
  return 'normal';
}

function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('fr-FR');
}

document.querySelectorAll('.filter-btn').forEach(button => {
  button.addEventListener('click', () => setFilter(button.dataset.filter, button));
});

document.getElementById('refresh-history').addEventListener('click', loadHistorique);

setInterval(updateClock, 1000);
updateClock();
loadHistorique();