// actionneurs.js - Gestion des actionneurs (Ventilateur, Pompe, LED) et Modes

function syncActeurCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const on = state.acteurs[id];
  card.className = `actionneur-card ${on ? 'on' : ''}`;
  
  const stateLabel = document.getElementById(`state-${id}`);
  if (stateLabel) stateLabel.textContent = on ? 'ALLUMÉ' : 'ÉTEINT';
  
  const btn = document.getElementById(`btn-${id}`);
  if (btn) {
    btn.textContent = on ? 'DÉSACTIVER' : 'ACTIVER';
    btn.className = `toggle-btn ${on ? 'on' : ''}`;
  }
}

function renderCommandes() {
  const body = document.getElementById('commandes-body');
  if (!body) return;
  
  if (state.commandes.length === 0) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;">Aucune commande récente</td></tr>';
    return;
  }

  body.innerHTML = state.commandes.slice(0, 10).map(c => `
    <tr>
      <td>${c.nom}</td>
      <td style="color:${c.action === 'ON' ? 'var(--green)' : 'var(--red)'}">${c.action}</td>
      <td><span class="badge normal">${c.source}</span></td>
      <td>${c.ts}</td>
    </tr>
  `).join('');
}

function toggleActeur(id) {
  if (state.mode === 'auto') {
    console.log("Action ignorée : mode automatique activé.");
    return;
  }
  
  // Inverse l'état
  state.acteurs[id] = !state.acteurs[id];
  syncActeurCard(id);
  
  // Ajout à l'historique
  state.commandes.unshift({ 
    nom: id.charAt(0).toUpperCase() + id.slice(1), 
    action: state.acteurs[id] ? 'ON' : 'OFF', 
    source: 'manuel', 
    ts: new Date().toLocaleTimeString('fr-FR') 
  });
  renderCommandes();

  // ⚠️ C'est ici que tu pourras ajouter ton appel réseau (MQTT/WebSockets/Fetch)
  // pour réellement activer le ventilateur sur le Raspberry/ESP8266
  // Exemple : sendPower(id === 'ventilo' && state.acteurs[id] ? 'FAN_ON' : 'FAN_OFF');
}

function setMode(m) {
  state.mode = m;
  const btnM = document.getElementById('btn-manuel');
  const btnA = document.getElementById('btn-auto');
  if (btnM) btnM.className = `mode-btn ${m === 'manuel' ? 'active' : ''}`;
  if (btnA) btnA.className = `mode-btn ${m === 'auto' ? 'active' : ''}`;
}

// Initialisation des événements liés aux actionneurs
document.addEventListener('DOMContentLoaded', () => {
  // Écouteurs pour les boutons d'actionneurs
  ['pompe', 'ventilo', 'led'].forEach(id => {
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.addEventListener('click', () => toggleActeur(id));
    syncActeurCard(id); // Synchronisation de l'affichage initial
  });

  // Écouteurs pour les modes
  const bM = document.getElementById('btn-manuel');
  if (bM) bM.addEventListener('click', () => setMode('manuel'));
  const bA = document.getElementById('btn-auto');
  if (bA) bA.addEventListener('click', () => setMode('auto'));

  // Affichage initial du tableau d'historique (qui sera vide)
  renderCommandes();
});
