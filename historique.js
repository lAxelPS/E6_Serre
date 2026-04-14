const state = {
  historique: [],
  filter: 'tous',
};

const labels = {
  temperature:  '🌡️ Température',
  humidite_air: '💧 Humidité air',
  luminosite:   '☀️ Luminosité',
  humidite_sol: '🌱 Humidité sol',
};

// ── URL du backend Flask (client_sub.py, port 5000) ───────────────────────
const API_URL    = 'http://localhost:5000/api/historique';
const STATUS_URL = 'http://localhost:5000/api/statut';

// ── Formatage valeur ──────────────────────────────────────────────────────
function fmtVal(type, val) {
  return type === 'luminosite' ? Math.round(Number(val)) : Number(val).toFixed(1);
}

// ── Formatte la date SQLite en français ───────────────────────────────────
function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T'));
  if (isNaN(d)) return ts;
  return d.toLocaleString('fr-FR');
}

// ── Rendu du tableau ──────────────────────────────────────────────────────
function renderHistorique() {
  const data = state.filter === 'tous'
    ? [...state.historique]
    : state.historique.filter(item => item.type === state.filter);

  if (data.length === 0) {
    document.getElementById('historique-body').innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:var(--text-dim);">Aucune mesure disponible.</td>
      </tr>`;
    return;
  }

  document.getElementById('historique-body').innerHTML = data.map((h, index) => `
    <tr>
      <td style="color:var(--text-dim)">${index + 1}</td>
      <td>${h.label || labels[h.type] || h.type}</td>
      <td class="val">${fmtVal(h.type, h.val)} ${h.unite}</td>
      <td><span class="badge ${h.statut}">${h.statut}</span></td>
      <td>${formatDate(h.ts)}</td>
    </tr>
  `).join('');
}

// ── Filtre ────────────────────────────────────────────────────────────────
function setFilter(filter, button) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  renderHistorique();
}

// ── Indicateur DB (sidebar) ───────────────────────────────────────────────
async function checkDbStatus() {
  const dot   = document.getElementById('db-dot');
  const label = document.getElementById('db-label');
  try {
    const res  = await fetch(STATUS_URL);
    const data = await res.json();
    if (data.ok) {
      if (dot)   dot.style.background = 'var(--green, #4ade80)';
      if (label) label.textContent    = `Base de données OK (${data.nb_mesures} mesures)`;
    } else {
      if (dot)   dot.style.background = 'var(--red, #f87171)';
      if (label) label.textContent    = 'Erreur base de données';
    }
  } catch {
    if (dot)   dot.style.background = 'var(--red, #f87171)';
    if (label) label.textContent    = 'Serveur inaccessible';
  }
}

// ── Chargement depuis l'API ───────────────────────────────────────────────
async function loadHistorique() {
  document.getElementById('historique-body').innerHTML = `
    <tr>
      <td colspan="5" style="text-align:center;color:var(--text-dim);">⏳ Chargement…</td>
    </tr>`;

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    }

    const data = await response.json();

    if (data.erreur) {
      throw new Error(data.erreur);
    }

    state.historique = data;   // TOUTES les lignes de la table mesures
    renderHistorique();
    await checkDbStatus();

  } catch (error) {
    document.getElementById('historique-body').innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:var(--red,#f87171);">
          ❌ Erreur de chargement : ${error.message}<br>
          <small>Vérifie que <code>client_sub.py</code> tourne sur <code>localhost:5000</code></small>
        </td>
      </tr>`;
    const dot   = document.getElementById('db-dot');
    const label = document.getElementById('db-label');
    if (dot)   dot.style.background = 'var(--red, #f87171)';
    if (label) label.textContent    = 'Serveur inaccessible';
  }
}

// ── Horloge ───────────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('fr-FR');
}

// ── Init ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(button => {
  button.addEventListener('click', () => setFilter(button.dataset.filter, button));
});

document.getElementById('refresh-history').addEventListener('click', loadHistorique);

setInterval(updateClock, 1000);
updateClock();
loadHistorique();   // chargement automatique à l'ouverture / F5
