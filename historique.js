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

// ── URL du backend Flask ───────────────────────────────────────────────────
// Si ton HTML est ouvert directement depuis le disque (file://), garde localhost.
// Si ton HTML est servi par Flask lui-même, tu peux mettre '/api/historique'.
const API_URL = 'http://localhost:5001/api/historique';
const STATUS_URL = 'http://localhost:5001/api/statut';

// ── Formatage valeur ──────────────────────────────────────────────────────
function fmtVal(type, val) {
  return type === 'luminosite' ? Math.round(Number(val)) : Number(val).toFixed(1);
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
      </tr>
    `;
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

// ── Formatte la date reçue depuis SQLite en français ─────────────────────
function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T'));   // "2025-07-01 14:32:00" → ISO
  if (isNaN(d)) return ts;                    // déjà formaté ou inconnu
  return d.toLocaleString('fr-FR');
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
  try {
    const res = await fetch(STATUS_URL);
    const data = await res.json();
    const dot   = document.getElementById('db-dot');
    const label = document.getElementById('db-label');
    if (data.ok) {
      dot.style.background   = 'var(--green, #4ade80)';
      label.textContent      = `Base de données OK (${data.nb_mesures} mesures)`;
    } else {
      dot.style.background   = 'var(--red, #f87171)';
      label.textContent      = 'Erreur base de données';
    }
  } catch {
    const dot   = document.getElementById('db-dot');
    const label = document.getElementById('db-label');
    dot.style.background     = 'var(--red, #f87171)';
    label.textContent        = 'Serveur inaccessible';
  }
}

// ── Chargement depuis l'API Flask/SQLite ──────────────────────────────────
async function loadHistorique() {
  // Affiche un indicateur de chargement
  document.getElementById('historique-body').innerHTML = `
    <tr>
      <td colspan="5" style="text-align:center;color:var(--text-dim);">⏳ Chargement…</td>
    </tr>
  `;

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    }

    const data = await response.json();

    // data est un tableau d'objets : { id, type, label, val, unite, statut, ts }
    state.historique = data;
    renderHistorique();
    await checkDbStatus();

  } catch (error) {
    document.getElementById('historique-body').innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:var(--red,#f87171);">
          ❌ Erreur de chargement : ${error.message}<br>
          <small>Vérifie que le serveur Python tourne sur <code>localhost:5001</code></small>
        </td>
      </tr>
    `;
    // Met à jour l'indicateur DB en rouge aussi
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