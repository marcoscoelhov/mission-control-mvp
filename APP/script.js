const fallbackData = {
  columns: [
    { name: 'Inbox', items: [] },
    { name: 'Assigned', items: [] },
    { name: 'In Progress', items: [] },
    { name: 'Review', items: [] },
    { name: 'Done', items: [] },
  ],
};

const agentsList = document.getElementById('agents-list');
const kanban = document.getElementById('kanban');
const livePanel = document.getElementById('live-panel');
const toggleLive = document.getElementById('toggle-live');
const workspace = document.querySelector('.workspace');
const agentDetails = document.getElementById('agent-details');
const liveFeed = document.getElementById('live-feed');
const liveToolbar = document.getElementById('live-toolbar');
const countEl = document.querySelector('.agents-panel .count');
const autoDelegateBtn = document.getElementById('auto-delegate');
const inboxChip = document.getElementById('inbox-chip');
const openBroadcastBtn = document.getElementById('open-broadcast');
const broadcastDrawer = document.getElementById('broadcast-drawer');
const closeBroadcastBtn = document.getElementById('close-broadcast');
const sendBroadcastBtn = document.getElementById('send-broadcast');
const missionTitleInput = document.getElementById('mission-title');
const missionDescInput = document.getElementById('mission-desc');
const missionRevenueInput = document.getElementById('mission-revenue');
const missionAutonomyInput = document.getElementById('mission-autonomy');
const missionUrgencyInput = document.getElementById('mission-urgency');
const missionEtaInput = document.getElementById('mission-eta');

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
let autonomyTimer = null;
let refreshMs = Number(localStorage.getItem('mc_refresh_ms') || 15000);
let boardState = fallbackData.columns.map((c) => ({ name: c.name, items: [...(c.items || [])] }));
let inboxMissions = [];
let activityLog = [];

const normalizeColumnKey = (name = '') => name.toLowerCase().trim().replace(/\s+/g, '_');
const prettyColumn = (key = '') => key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const makeCardId = (title = '') => `card_${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
const escapeHtml = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function notify(msg) {
  console.log(msg);
}

function renderLiveFeed() {
  if (!liveFeed) return;
  liveFeed.innerHTML = '';
  if (!activityLog.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-column';
    empty.textContent = 'Sem eventos ainda. O histórico aparece aqui.';
    liveFeed.appendChild(empty);
    return;
  }

  activityLog.forEach((ev) => {
    const item = document.createElement('article');
    item.className = 'feed-item';
    item.innerHTML = `<strong>${escapeHtml(ev.title)}</strong><p>${escapeHtml(ev.message)}</p>`;
    liveFeed.appendChild(item);
  });
}

function addLiveEvent(title, message) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  activityLog.unshift({ title, message: `${message} • ${time}` });
  activityLog = activityLog.slice(0, 80);
  renderLiveFeed();
}

function setAutonomousVisuals(enabled) {
  document.body.classList.toggle('autonomous-on', Boolean(enabled));
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

async function persistBroadcastMission(payload) {
  for (const url of ['/api/missions/broadcast', '/api/mission/broadcast', '/api/missions']) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch (_) {}
  }
  return false;
}

function refreshInboxChip() {
  if (!inboxChip) return;
  inboxChip.textContent = `Inbox: ${inboxMissions.length}`;
}

function addMissionToInbox(card) {
  inboxMissions.unshift(card);
  const inboxCol = getColumn('inbox');
  if (inboxCol) inboxCol.items = [...inboxMissions];
  refreshInboxChip();
  if (localStorage.getItem('mc_autonomous') === '1') autonomousTick();
}

async function saveAutonomousMode(enabled) {
  localStorage.setItem('mc_autonomous', enabled ? '1' : '0');
  autonomousStatus.textContent = enabled ? 'Modo autônomo ativado.' : 'Modo autônomo desativado.';
  setAutonomousVisuals(enabled);
  addLiveEvent('Modo autônomo', enabled ? 'Ativado' : 'Desativado');
  if (enabled) autonomousTick();
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

  const rankWeight = { General: 0, Oficial: 1, Conselho: 2 };
  const ordered = [...agents].sort((a, b) => {
    const wa = rankWeight[a.rank] ?? 99;
    const wb = rankWeight[b.rank] ?? 99;
    if (wa !== wb) return wa - wb;
    return (a.name || '').localeCompare(b.name || '');
  });

  const selected = ordered.find((a) => a.id === selectedAgentId) || ordered[0];
  if (selected) selectedAgentId = selected.id;

  const groups = [
    ['General', 'Generais'],
    ['Oficial', 'Oficiais'],
    ['Conselho', 'Conselho'],
    ['__other__', 'Outros'],
  ];

  groups.forEach(([key, label]) => {
    const list = ordered.filter((a) => (key === '__other__' ? !Object.prototype.hasOwnProperty.call(rankWeight, a.rank) : a.rank === key));
    if (!list.length) return;

    const header = document.createElement('div');
    header.className = 'agent-group-label';
    header.textContent = label;
    agentsList.appendChild(header);

    list.forEach((agent) => {
      const statusClass = (agent.status || '').toLowerCase().replace(/\s+/g, '-');
      const item = document.createElement('article');
      item.className = `agent-item ${agent.id === selectedAgentId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="agent-icon">${escapeHtml(agent.icon)}</div>
        <div class="agent-main"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.role)}</span></div>
        <div class="status ${escapeHtml(statusClass)}"><span class="status-dot"></span>${escapeHtml(agent.status)}</div>
      `;
      item.addEventListener('click', () => {
        selectedAgentId = agent.id;
        document.querySelectorAll('.agent-item.active').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        renderAgentDetails(agent);
        setLiveTab('agent');
        if (livePanel.classList.contains('collapsed')) {
          livePanel.classList.remove('collapsed');
          workspace.classList.remove('live-collapsed');
        }
      });
      agentsList.appendChild(item);
    });
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
    addLiveEvent('Jarvis aprovou missão', card.dataset.title || 'Missão sem título');
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
  boardState = columns.map((c) => ({ name: c.name, items: [...(c.items || [])] }));
  const inboxColumn = boardState.find((c) => normalizeColumnKey(c.name) === 'inbox');
  inboxMissions = [...(inboxColumn?.items || [])].map(normalizeCard);
  refreshInboxChip();

  kanban.innerHTML = '';

  const visibleColumns = columns.filter((c) => normalizeColumnKey(c.name) !== 'inbox');

  visibleColumns.forEach((col) => {
    const column = document.createElement('section');
    column.className = 'column';
    column.dataset.column = normalizeColumnKey(col.name);

    const cards = document.createElement('div');
    cards.className = 'cards';

    const normalized = (col.items || []).map(normalizeCard).sort((a, b) => priorityScore(b) - priorityScore(a));
    normalized.forEach((item) => cards.appendChild(createCard(item)));
    if (!normalized.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-column';
      empty.textContent = `Sem missões em ${prettyColumn(normalizeColumnKey(col.name))}.`;
      cards.appendChild(empty);
    }

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
      addLiveEvent('Movimentação de missão', `${draggedCard.dataset.title || 'Missão'}: ${prettyColumn(fromColumn || 'desconhecido')} → ${prettyColumn(toColumn || 'desconhecido')}`);
    });

    column.innerHTML = `<header class="column-head"><span>${escapeHtml(col.name)}</span><span>${normalized.length}</span></header>`;
    column.appendChild(cards);
    kanban.appendChild(column);
  });
}

function getColumn(key) {
  return boardState.find((c) => normalizeColumnKey(c.name) === key);
}

function autoDelegateInbox(silent = false) {
  const assignedCol = getColumn('assigned');
  if (!assignedCol) return;

  const total = inboxMissions.length;
  if (!total) {
    if (!silent) notify('Inbox está vazio.');
    return;
  }

  const delegated = inboxMissions.map((m) => ({
    ...normalizeCard(m),
    owner: inferOwner(`${m.title} ${m.desc}`),
  }));

  assignedCol.items = [...delegated, ...(assignedCol.items || [])];
  inboxMissions = [];
  const inboxCol = getColumn('inbox');
  if (inboxCol) inboxCol.items = [];

  renderBoard(boardState);
  if (!silent) notify(`Auto-delegação concluída: ${total} missão(ões).`);
  addLiveEvent('Stark auto-delegou inbox', `${total} missão(ões) encaminhadas para Assigned.`);
}

function moveOneMission(fromKey, toKey, transform = (x) => x) {
  const from = getColumn(fromKey);
  const to = getColumn(toKey);
  if (!from || !to || !(from.items || []).length) return false;

  const item = normalizeCard(from.items.shift());
  to.items.unshift(transform(item));
  renderBoard(boardState);
  addLiveEvent('Fluxo autônomo', `${item.title}: ${prettyColumn(fromKey)} → ${prettyColumn(toKey)}`);
  return true;
}

function autonomousTick() {
  const autonomousOn = localStorage.getItem('mc_autonomous') === '1';
  if (!autonomousOn) return;

  if (inboxMissions.length) {
    autoDelegateInbox(true);
    return;
  }

  const assigned = getColumn('assigned');
  if (assigned?.items?.length) {
    const first = normalizeCard(assigned.items[0]);
    if (!first.approved) {
      assigned.items[0] = { ...first, approved: true };
      renderBoard(boardState);
      addLiveEvent('Jarvis aprovou missão', first.title);
      return;
    }
    if (moveOneMission('assigned', 'in_progress')) return;
  }

  if (moveOneMission('in_progress', 'review')) return;
  moveOneMission('review', 'done');
}

function startAutonomyLoop() {
  if (autonomyTimer) clearInterval(autonomyTimer);
  autonomyTimer = setInterval(autonomousTick, 5000);
}

function setSettingsTab(tab) {
  settingsTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.settings-section').forEach((section) => section.classList.toggle('active', section.id === `tab-${tab}`));
}

function setLiveTab(tab) {
  document.querySelectorAll('#live-toolbar .chip').forEach((btn) => btn.classList.toggle('active', btn.dataset.liveTab === tab));
  document.getElementById('live-history-tab')?.classList.toggle('live-tab-active', tab === 'history');
  document.getElementById('live-agent-tab')?.classList.toggle('live-tab-active', tab === 'agent');
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
    if (!isCollapsed) setLiveTab('history');
  });

  liveToolbar?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-live-tab]');
    if (!btn) return;
    setLiveTab(btn.dataset.liveTab);
  });

  autoDelegateBtn?.addEventListener('click', autoDelegateInbox);
  inboxChip?.addEventListener('click', () => {
    broadcastDrawer.classList.add('open');
    settingsDrawer.classList.remove('open');
  });

  openBroadcastBtn?.addEventListener('click', () => {
    broadcastDrawer.classList.add('open');
    settingsDrawer.classList.remove('open');
  });
  closeBroadcastBtn?.addEventListener('click', () => broadcastDrawer.classList.remove('open'));

  sendBroadcastBtn?.addEventListener('click', async () => {
    const title = missionTitleInput.value.trim();
    const desc = missionDescInput.value.trim();
    if (!title || !desc) {
      notify('Preencha título e descrição da missão.');
      return;
    }

    const card = {
      title,
      desc,
      owner: 'Stark',
      eta: missionEtaInput.value.trim() || 'agora',
      impactRevenue: Math.max(0, Math.min(5, Number(missionRevenueInput.value || 3))),
      impactAutonomy: Math.max(0, Math.min(5, Number(missionAutonomyInput.value || 3))),
      urgency: Math.max(0, Math.min(5, Number(missionUrgencyInput.value || 3))),
      approved: false,
    };

    addMissionToInbox(card);
    await persistBroadcastMission(card);
    addLiveEvent('Broadcast recebeu missão', `${card.title} entrou no Inbox para triagem do Stark.`);

    missionTitleInput.value = '';
    missionDescInput.value = '';
    broadcastDrawer.classList.remove('open');
  });

  openSettingsBtn.addEventListener('click', () => {
    settingsDrawer.classList.add('open');
    broadcastDrawer.classList.remove('open');
  });
  closeSettingsBtn.addEventListener('click', () => settingsDrawer.classList.remove('open'));
  settingsTabButtons.forEach((btn) => btn.addEventListener('click', () => setSettingsTab(btn.dataset.tab)));

  const autonomous = localStorage.getItem('mc_autonomous') === '1';
  autonomousToggle.checked = autonomous;
  autonomousStatus.textContent = autonomous ? 'Modo autônomo ativado.' : 'Modo autônomo desativado.';
  setAutonomousVisuals(autonomous);
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
  renderLiveFeed();
  setLiveTab('history');
  const [dashboard, agents] = await Promise.all([loadDashboard(), loadAgentsDetails(), loadMission()]);
  renderBoard(dashboard.columns || fallbackData.columns);
  if (agents.length) renderAgents(agents);
  addLiveEvent('Live inicializado', 'Histórico pronto para acompanhar o que foi feito.');
  startRealtimeRefresh();
  startAutonomyLoop();
}

init();
