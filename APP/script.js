const fallbackData = {
  agents: [
    ['🛠️', 'Friday', 'Developer Agent'],
    ['📈', 'Fury', 'Customer Research'],
    ['🌱', 'Groot', 'Retention Specialist'],
    ['🏹', 'Hawkeye', 'Outbound Scout'],
  ],
  columns: [
    { name: 'Inbox', items: [['E-commerce Vertical Implementation Guide', 'Comprehensive docs for 11 core verticals.', 'Friday', '4m']] },
    { name: 'Assigned', items: [['Execute Real Estate Distribution', 'Run distribution protocol for geo-specific blogs.', 'Groot', '40m']] },
    { name: 'In Progress', items: [['Listicle Outreach Campaign - 5 Targets', 'Execute outreach to high-priority AI chatbot sites.', 'Hawkeye', '2d']] },
    { name: 'Review', items: [['SiteGPT Hero Video Production', 'Produce 30-45 second hero clip.', 'Wanda', '3d']] },
    { name: 'Done', items: [['Shopify Blog Landing Page', 'Landing page copy and metadata finalized.', 'Loki', '2d']] },
  ],
};

const agentsList = document.getElementById('agents-list');
const kanban = document.getElementById('kanban');
const livePanel = document.getElementById('live-panel');
const toggleLive = document.getElementById('toggle-live');
const workspace = document.querySelector('.workspace');
const agentDetails = document.getElementById('agent-details');
const countEl = document.querySelector('.agents-panel .count');

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
const makeCardId = (title = '') => `card_${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
const escapeHtml = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const normalizeAgent = (agent) => {
  if (Array.isArray(agent)) {
    const [icon, name, role] = agent;
    return { id: (name || '').toLowerCase(), icon, name, role, status: 'working', model: 'n/a', soul: '', memory: '' };
  }
  return {
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
  };
};

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
  return fallbackData.agents.map(normalizeAgent);
}

async function loadMission() {
  for (const url of ['/api/mission.md', './MISSAO.md']) {
    try {
      const text = await fetchText(url);
      missionContent.textContent = text;
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

  for (const req of [
    { url: '/api/autonomous/mode', body: { enabled } },
    { url: '/api/reinado/ajustes', body: { auto_exec_enabled: enabled } },
  ]) {
    try {
      const res = await fetch(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
      if (res.ok) return;
    } catch (_) {}
  }
}

function renderAgentDetails(agent) {
  if (!agent) return;
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
    const isActive = agent.id === selectedAgentId;
    const item = document.createElement('article');
    item.className = `agent-item ${isActive ? 'active' : ''}`;
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

function createCard([title, desc, owner, eta]) {
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;
  card.dataset.cardId = makeCardId(title);
  card.dataset.title = title;
  card.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p><div class="card-foot"><span>${escapeHtml(owner)}</span><span>${escapeHtml(eta)} ago</span></div>`;

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
    cards.addEventListener('dragover', (e) => { e.preventDefault(); cards.classList.add('drag-over'); });
    cards.addEventListener('dragleave', () => cards.classList.remove('drag-over'));
    cards.addEventListener('drop', async (e) => {
      e.preventDefault();
      cards.classList.remove('drag-over');
      if (!draggedCard) return;

      const fromColumn = draggedCard.closest('.column')?.dataset.column || null;
      const toColumn = column.dataset.column;
      const siblings = [...cards.querySelectorAll('.card:not(.dragging)')];
      const next = siblings.find((s) => e.clientY <= s.getBoundingClientRect().top + s.offsetHeight / 2);
      if (next) cards.insertBefore(draggedCard, next); else cards.appendChild(draggedCard);
      const toIndex = [...cards.querySelectorAll('.card')].indexOf(draggedCard);
      updateAllCounts();
      await persistMove({ cardId: draggedCard.dataset.cardId, title: draggedCard.dataset.title, fromColumn, toColumn, toIndex });
    });

    (col.items || []).forEach((item) => cards.appendChild(createCard(item)));
    column.innerHTML = `<header class="column-head"><span>${escapeHtml(col.name)}</span><span>${(col.items || []).length}</span></header>`;
    column.appendChild(cards);
    kanban.appendChild(column);
  });
}

function setSettingsTab(tab) {
  settingsTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.settings-section').forEach((section) => section.classList.toggle('active', section.id === `tab-${tab}`));
}

function startRealtimeRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    const agents = await loadAgentsDetails();
    renderAgents(agents);
  }, refreshMs);
}

function setupUI() {
  workspace.classList.add('live-collapsed');

  toggleLive.addEventListener('click', () => {
    const isCollapsed = livePanel.classList.toggle('collapsed');
    workspace.classList.toggle('live-collapsed', isCollapsed);
  });

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
  renderAgents(agents);
  startRealtimeRefresh();
}

init();
