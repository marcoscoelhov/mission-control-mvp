const fallbackData = {
  columns: [
    { name: 'Inbox', items: [['API de cobrança recorrente', 'Criar serviço de assinatura com webhook.', 'Stark', '4m']] },
    { name: 'Assigned', items: [['Landing de oferta premium', 'Página de conversão com prova social.', 'Wanda', '40m']] },
    { name: 'In Progress', items: [['Pipeline de deploy', 'Padronizar build/deploy com rollback.', 'Thanos', '2d']] },
    { name: 'Review', items: [['Auditoria de fluxo comercial', 'Checar gargalos no handoff vendas→sucesso.', 'Alfred', '3d']] },
    { name: 'Done', items: [['Dashboard baseline', 'Estrutura visual inicial publicada.', 'Stark', '2d']] },
  ],
};

const agentsList = document.getElementById('agents-list');
const kanban = document.getElementById('kanban');
const livePanel = document.getElementById('live-panel');
const toggleLive = document.getElementById('toggle-live');
const workspace = document.querySelector('.workspace');
const agentDetails = document.getElementById('agent-details');
const countEl = document.querySelector('.agents-panel .count');
const autoDelegateBtn = document.getElementById('auto-delegate');

const settingsDrawer = document.getElementById('settings-drawer');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsTabButtons = [...document.querySelectorAll('.settings-tabs .chip')];
const missionContent = document.getElementById('mission-content');
const autonomousToggle = document.getElementById('autonomous-toggle');
const autonomousStatus = document.getElementById('autonomous-status');
const refreshSecondsInput = document.getElementById('refresh-seconds');
const saveGeneralBtn = document.getElementById('save-general');

let draggedCard = null;
let selectedAgentId = null;
let refreshTimer = null;
let refreshMs = Number(localStorage.getItem('mc_refresh_ms') || 15000);

const normalizeColumnKey = (name = '') => name.toLowerCase().trim().replace(/\s+/g, '_');
const prettyColumn = (key = '') => key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const makeCardId = (title = '') => `card_${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
const escapeHtml = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function notify(msg) {
  console.log(msg);
}

function priorityScore(card) {
  return Number(card.impactRevenue || 0) + Number(card.impactAutonomy || 0) + Number(card.urgency || 0);
}

function inferOwner(text) {
  const t = text.toLowerCase();
  if (/(api|backend|deploy|infra|server|banco|db|código|code|integra)/.test(t)) return 'Thanos';
  if (/(ui|ux|frontend|front|layout|página|design|landing|tela)/.test(t)) return 'Wanda';
  if (/(auditoria|auditar|gargalo|dependên|distribui|fluxo|handoff)/.test(t)) return 'Alfred';
  return 'Stark';
}

function normalizeCard(item) {
  if (Array.isArray(item)) {
    const [title, desc, owner, eta] = item;
    return {
      title,
      desc,
      owner,
      eta,
      impactRevenue: 3,
      impactAutonomy: 3,
      urgency: 3,
      approved: owner === 'Thanos' || owner === 'Wanda' || owner === 'Alfred',
    };
  }
  return {
    title: item.title || 'Sem título',
    desc: item.desc || '',
    owner: item.owner || 'Stark',
    eta: item.eta || '0m',
    impactRevenue: Number(item.impactRevenue ?? 3),
    impactAutonomy: Number(item.impactAutonomy ?? 3),
    urgency: Number(item.urgency ?? 3),
    approved: Boolean(item.approved),
  };
}

const normalizeAgent = (agent) => ({
  id: agent?.id || (agent?.name || 'agent').toLowerCase(),
  icon: agent?.icon || '🤖',
  name: agent?.name || 'Agent',
  role: agent?.role || 'OpenClaw Agent',
  rank: agent?.rank || '—',
  mission: agent?.mission || '',
  status: agent?.status || 'online',
  model: agent?.model || 'unknown',
  soul: agent?.soul || '',
  memory: agent?.memory || '',
});

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('fetch failed');
  return res.text();
}

async function loadDashboard() {
  try { const d = await fetchJson('/api/dashboard'); if (Array.isArray(d?.columns)) return d; } catch (_) {}
  try { return await fetchJson('./data.json'); } catch (_) { return fallbackData; }
}

async function loadAgentsDetails() {
  for (const url of ['/api/openclaw/agents/details', './openclaw-agents-details.json', '/api/openclaw/agents']) {
    try {
      const d = await fetchJson(url);
      if (Array.isArray(d?.agents)) return d.agents.map(normalizeAgent);
    } catch (_) {}
  }
  return [];
}

async function loadMission() {
  for (const url of ['/api/mission.md', './MISSAO.md']) {
    try {
      missionContent.textContent = await fetchText(url);
      return;
    } catch (_) {}
  }
  missionContent.textContent = 'Missão não encontrada.';
}

async function persistMove(payload) {
  for (const url of ['/api/dashboard/move', '/api/cards/move', '/api/card/move']) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) return true;
    } catch (_) {}
  }
  return false;
}

async function saveAutonomousMode(enabled) {
  localStorage.setItem('mc_autonomous', enabled ? '1' : '0');
  autonomousStatus.textContent = enabled ? 'Modo autônomo ativado.' : 'Modo autônomo desativado.';
  for (const req of [{ url: '/api/autonomous/mode', body: { enabled } }, { url: '/api/reinado/ajustes', body: { auto_exec_enabled: enabled } }]) {
    try {
      const res = await fetch(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
      if (res.ok) return;
    } catch (_) {}
  }
}

function renderAgentDetails(agent) {
  const soul = agent.soul || 'SOUL.md não encontrado para este agente.';
  const memory = agent.memory || 'MEMORY.md não encontrado para este agente.';
  agentDetails.innerHTML = `
    <div class="detail-head">
      <div class="agent-icon lg">${escapeHtml(agent.icon)}</div>
      <div><h3>${escapeHtml(agent.name)}</h3><p class="muted">${escapeHtml(agent.role)} • ${escapeHtml(agent.status)}</p></div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><span>Modelo</span><strong>${escapeHtml(agent.model)}</strong></div>
      <div class="meta-item"><span>Patente</span><strong>${escapeHtml(agent.rank || '—')}</strong></div>
      <div class="meta-item"><span>Função</span><strong>${escapeHtml(agent.role)}</strong></div>
      <div class="meta-item"><span>Agent ID</span><strong>${escapeHtml(agent.id)}</strong></div>
    </div>
    <div class="doc-block"><h4>Missão do Agente</h4><pre>${escapeHtml(agent.mission || 'Não definida ainda.')}</pre></div>
    <div class="doc-block"><h4>SOUL.md</h4><pre>${escapeHtml(soul)}</pre></div>
    <div class="doc-block"><h4>MEMORY.md</h4><pre>${escapeHtml(memory)}</pre></div>
  `;
}

function renderAgents(agents) {
  agentsList.innerHTML = '';
  if (countEl) countEl.textContent = String(agents.length);
  const selected = agents.find((a) => a.id === selectedAgentId) || agents[0];
  if (selected) selectedAgentId = selected.id;

  agents.forEach((agent) => {
    const item = document.createElement('article');
    item.className = `agent-item ${agent.id === selectedAgentId ? 'active' : ''}`;
    item.innerHTML = `<div class="agent-icon">${escapeHtml(agent.icon)}</div><div class="agent-main"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.role)}</span></div><div class="status">${escapeHtml(agent.status)}</div>`;
    item.addEventListener('click', () => {
      selectedAgentId = agent.id;
      document.querySelectorAll('.agent-item.active').forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      renderAgentDetails(agent);
      if (livePanel.classList.contains('collapsed')) {
        livePanel.classList.remove('collapsed');
        workspace.classList.remove('live-collapsed');
      }
    });
    agentsList.appendChild(item);
  });

  if (selected) renderAgentDetails(selected);
}

function serializeCard(card) {
  return {
    title: card.dataset.title,
    desc: card.dataset.desc,
    owner: card.dataset.owner,
    eta: card.dataset.eta,
    impactRevenue: Number(card.dataset.impactRevenue || 0),
    impactAutonomy: Number(card.dataset.impactAutonomy || 0),
    urgency: Number(card.dataset.urgency || 0),
    approved: card.dataset.approved === '1',
  };
}

function createCard(item) {
  const c = normalizeCard(item);
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;
  card.dataset.cardId = makeCardId(c.title);
  card.dataset.title = c.title;
  card.dataset.desc = c.desc;
  card.dataset.owner = c.owner;
  card.dataset.eta = c.eta;
  card.dataset.impactRevenue = String(c.impactRevenue);
  card.dataset.impactAutonomy = String(c.impactAutonomy);
  card.dataset.urgency = String(c.urgency);
  card.dataset.approved = c.approved ? '1' : '0';

  const score = priorityScore(c);
  const approveBtn = c.approved
    ? `<span class="chip mini approved">Aprovado</span>`
    : `<button class="chip mini" data-action="approve">Aprovar (Jarvis)</button>`;

  card.innerHTML = `
    <h3>${escapeHtml(c.title)}</h3>
    <p>${escapeHtml(c.desc)}</p>
    <div class="score-row">
      <span class="score-pill">💰 ${c.impactRevenue}</span>
      <span class="score-pill">🤖 ${c.impactAutonomy}</span>
      <span class="score-pill">⚡ ${c.urgency}</span>
      <span class="score-pill total">Σ ${score}</span>
    </div>
    <div class="card-foot">
      <span>${escapeHtml(c.owner)}</span>
      <span>${escapeHtml(c.eta)} ago</span>
    </div>
    <div class="approve-row">${approveBtn}</div>
  `;

  card.querySelector('[data-action="approve"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    card.dataset.approved = '1';
    const row = card.querySelector('.approve-row');
    if (row) row.innerHTML = `<span class="chip mini approved">Aprovado</span>`;
  });

  card.addEventListener('dblclick', () => {
    const r = Number(prompt('Impacto Receita (0-5):', card.dataset.impactRevenue || '3'));
    const a = Number(prompt('Impacto Autonomia (0-5):', card.dataset.impactAutonomy || '3'));
    const u = Number(prompt('Urgência (0-5):', card.dataset.urgency || '3'));
    if ([r, a, u].some((x) => Number.isNaN(x))) return;
    card.dataset.impactRevenue = String(Math.max(0, Math.min(5, r)));
    card.dataset.impactAutonomy = String(Math.max(0, Math.min(5, a)));
    card.dataset.urgency = String(Math.max(0, Math.min(5, u)));
    const data = serializeCard(card);
    const replacement = createCard(data);
    card.replaceWith(replacement);
  });

  card.addEventListener('dragstart', () => { draggedCard = card; card.classList.add('dragging'); });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCard = null;
    document.querySelectorAll('.cards.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });

  return card;
}

function updateAllCounts() {
  document.querySelectorAll('.column').forEach((column) => {
    const total = column.querySelectorAll('.card').length;
    const el = column.querySelector('.column-head span:last-child');
    if (el) el.textContent = String(total);
  });
}

function renderBoard(columns) {
  kanban.innerHTML = '';

  columns.forEach((col) => {
    const column = document.createElement('section');
    column.className = 'column';
    column.dataset.column = normalizeColumnKey(col.name);

    const cards = document.createElement('div');
    cards.className = 'cards';

    const normalized = (col.items || []).map(normalizeCard).sort((a, b) => priorityScore(b) - priorityScore(a));
    normalized.forEach((item) => cards.appendChild(createCard(item)));

    cards.addEventListener('dragover', (e) => { e.preventDefault(); cards.classList.add('drag-over'); });
    cards.addEventListener('dragleave', () => cards.classList.remove('drag-over'));

    cards.addEventListener('drop', async (e) => {
      e.preventDefault();
      cards.classList.remove('drag-over');
      if (!draggedCard) return;

      const fromColumn = draggedCard.closest('.column')?.dataset.column || null;
      const toColumn = column.dataset.column;

      if (toColumn === 'in_progress' && draggedCard.dataset.approved !== '1') {
        notify('Gate Jarvis: esta missão precisa estar aprovada antes de ir para In Progress.');
        return;
      }

      const siblings = [...cards.querySelectorAll('.card:not(.dragging)')];
      const next = siblings.find((s) => e.clientY <= s.getBoundingClientRect().top + s.offsetHeight / 2);
      if (next) cards.insertBefore(draggedCard, next); else cards.appendChild(draggedCard);

      if (toColumn === 'assigned' && draggedCard.dataset.owner === 'Stark') {
        const inferred = inferOwner(`${draggedCard.dataset.title} ${draggedCard.dataset.desc}`);
        draggedCard.dataset.owner = inferred;
        const ownerEl = draggedCard.querySelector('.card-foot span:first-child');
        if (ownerEl) ownerEl.textContent = inferred;
      }

      const toIndex = [...cards.querySelectorAll('.card')].indexOf(draggedCard);
      updateAllCounts();
      await persistMove({ cardId: draggedCard.dataset.cardId, title: draggedCard.dataset.title, fromColumn, toColumn, toIndex });
    });

    column.innerHTML = `<header class="column-head"><span>${escapeHtml(col.name)}</span><span>${normalized.length}</span></header>`;
    column.appendChild(cards);
    kanban.appendChild(column);
  });
}

function autoDelegateInbox() {
  const inbox = document.querySelector('.column[data-column="inbox"] .cards');
  const assigned = document.querySelector('.column[data-column="assigned"] .cards');
  if (!inbox || !assigned) return;

  const cards = [...inbox.querySelectorAll('.card')];
  cards.forEach((card) => {
    const inferred = inferOwner(`${card.dataset.title} ${card.dataset.desc}`);
    card.dataset.owner = inferred;
    const ownerEl = card.querySelector('.card-foot span:first-child');
    if (ownerEl) ownerEl.textContent = inferred;
    assigned.appendChild(card);
  });

  updateAllCounts();
  notify(`Auto-delegação concluída: ${cards.length} missão(ões).`);
}

function setSettingsTab(tab) {
  settingsTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.settings-section').forEach((section) => section.classList.toggle('active', section.id === `tab-${tab}`));
}

function startRealtimeRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    const agents = await loadAgentsDetails();
    if (agents.length) renderAgents(agents);
  }, refreshMs);
}

function setupUI() {
  workspace.classList.add('live-collapsed');
  toggleLive.addEventListener('click', () => {
    const isCollapsed = livePanel.classList.toggle('collapsed');
    workspace.classList.toggle('live-collapsed', isCollapsed);
  });

  autoDelegateBtn?.addEventListener('click', autoDelegateInbox);

  openSettingsBtn.addEventListener('click', () => settingsDrawer.classList.add('open'));
  closeSettingsBtn.addEventListener('click', () => settingsDrawer.classList.remove('open'));
  settingsTabButtons.forEach((btn) => btn.addEventListener('click', () => setSettingsTab(btn.dataset.tab)));

  const autonomous = localStorage.getItem('mc_autonomous') === '1';
  autonomousToggle.checked = autonomous;
  autonomousStatus.textContent = autonomous ? 'Modo autônomo ativado.' : 'Modo autônomo desativado.';
  autonomousToggle.addEventListener('change', () => saveAutonomousMode(autonomousToggle.checked));

  refreshSecondsInput.value = String(Math.round(refreshMs / 1000));
  saveGeneralBtn.addEventListener('click', () => {
    const secs = Math.max(5, Number(refreshSecondsInput.value || 15));
    refreshMs = secs * 1000;
    localStorage.setItem('mc_refresh_ms', String(refreshMs));
    startRealtimeRefresh();
  });
}

async function init() {
  setupUI();
  const [dashboard, agents] = await Promise.all([loadDashboard(), loadAgentsDetails(), loadMission()]);
  renderBoard(dashboard.columns || fallbackData.columns);
  if (agents.length) renderAgents(agents);
  startRealtimeRefresh();
}

init();
