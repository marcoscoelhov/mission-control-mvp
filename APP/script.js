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
const openChatBtn = document.getElementById('open-chat');
const chatDrawer = document.getElementById('chat-drawer');
const closeChatBtn = document.getElementById('close-chat');
const chatFeed = document.getElementById('chat-feed');
const chatFromInput = document.getElementById('chat-from');
const chatTextInput = document.getElementById('chat-text');
const sendChatBtn = document.getElementById('send-chat');
const missionTitleInput = document.getElementById('mission-title');
const missionDescInput = document.getElementById('mission-desc');
const missionPriorityInput = document.getElementById('mission-priority');
const missionEtaInput = document.getElementById('mission-eta');

const settingsDrawer = document.getElementById('settings-drawer');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsTabButtons = [...document.querySelectorAll('.settings-tabs .chip')];
const missionContent = document.getElementById('mission-content');
const autonomousToggle = document.getElementById('autonomous-toggle');
const autonomousStatus = document.getElementById('autonomous-status');
const refreshSecondsInput = document.getElementById('refresh-seconds');
const apiHealthInput = document.getElementById('api-health');
const apiBroadcastInput = document.getElementById('api-broadcast');
const apiMoveInput = document.getElementById('api-move');
const apiBoardStateInput = document.getElementById('api-board-state');
const apiAutonomousInput = document.getElementById('api-autonomous');
const saveGeneralBtn = document.getElementById('save-general');
const toastWrap = document.getElementById('toast-wrap');
const throughputValue = document.getElementById('throughput-value');
const missionHistoryView = document.getElementById('mission-history-view');
const agentsActiveValue = document.getElementById('agents-active-value');
const tasksQueueValue = document.getElementById('tasks-queue-value');

let draggedCard = null;
let selectedAgentId = null;
let refreshTimer = null;
let autonomyTimer = null;
let refreshMs = Number(localStorage.getItem('mc_refresh_ms') || 15000);
let boardState = fallbackData.columns.map((c) => ({ name: c.name, items: [...(c.items || [])] }));
let inboxMissions = [];
let activityLog = [];
let executionsWindow = [];
let selectedMissionKey = 'system';
let telemetryState = { agents: [], summary: { activeSessions: 0 } };

const normalizeColumnKey = (name = '') => name.toLowerCase().trim().replace(/\s+/g, '_');
const prettyColumn = (key = '') => key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const makeCardId = (title = '') => `card_${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
const makeMissionId = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const hasExecutionProof = (cardLike = {}) => {
  const c = normalizeCard(cardLike);
  const ex = c.execution || {};
  const evidence = Array.isArray(ex.evidence) ? ex.evidence : [];
  const status = String(ex.status || c.executionStatus || '').toLowerCase();
  return status === 'effective' && evidence.length > 0;
};
const escapeHtml = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function notify(msg) {
  console.log(msg);
}

function showToast(text) {
  if (!toastWrap) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  toastWrap.prepend(t);
  setTimeout(() => t.remove(), 2600);
}

function bumpThroughput() {
  const now = Date.now();
  executionsWindow.push(now);
  executionsWindow = executionsWindow.filter((x) => now - x <= 60000);
  if (throughputValue) throughputValue.textContent = String(executionsWindow.length);
}

function pulseFlow() {
  kanban.classList.remove('flow-active');
  void kanban.offsetWidth;
  kanban.classList.add('flow-active');
  setTimeout(() => kanban.classList.remove('flow-active'), 1300);
}

function renderMissionHistory(key) {
  if (!missionHistoryView) return;
  const logs = activityLog.filter((e) => (e.missionKey || 'system') === key);
  if (!logs.length) {
    missionHistoryView.textContent = 'Sem eventos para esta missão.';
    return;
  }
  missionHistoryView.textContent = logs
    .slice()
    .reverse()
    .map((e) => `- ${e.title}: ${e.message}`)
    .join('\n');
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

  const missionMap = new Map();
  activityLog.forEach((ev) => {
    const key = ev.missionKey || 'system';
    if (!missionMap.has(key)) missionMap.set(key, ev);
  });

  const cards = [...missionMap.entries()].map(([key, ev]) => ({ key, ev }));
  if (!cards.find((c) => c.key === selectedMissionKey)) selectedMissionKey = cards[0]?.key || 'system';

  cards.forEach(({ key, ev }) => {
    const item = document.createElement('article');
    item.className = `feed-item ${key === selectedMissionKey ? 'active' : ''}`;
    item.innerHTML = `<strong>${escapeHtml(ev.missionTitle || ev.title)}</strong><p>${escapeHtml(ev.message)}</p>`;
    item.addEventListener('click', () => {
      selectedMissionKey = key;
      renderLiveFeed();
      renderMissionHistory(key);
    });
    liveFeed.appendChild(item);
  });

  renderMissionHistory(selectedMissionKey);
}

function addLiveEvent(title, message, emphasize = false, meta = {}) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const missionKey = meta.missionKey || 'system';
  const missionTitle = meta.missionTitle || null;
  activityLog.unshift({ title, missionTitle, missionKey, message: `${message} • ${time}` });
  activityLog = activityLog.slice(0, 200);
  renderLiveFeed();
  if (emphasize) {
    showToast(`${title}: ${message}`);
    pulseFlow();
    bumpThroughput();
  }
}

function setAutonomousVisuals(enabled) {
  document.body.classList.toggle('autonomous-on', Boolean(enabled));
}

function updateHeaderMetrics() {
  if (agentsActiveValue) {
    const teleActive = Number(telemetryState?.summary?.activeSessions || 0);
    if (teleActive > 0) {
      agentsActiveValue.textContent = String(teleActive);
    } else {
      const active = [...document.querySelectorAll('.status')].filter((el) => {
        const t = (el.textContent || '').toLowerCase();
        return t.includes('trabalhando') || t.includes('online');
      }).length;
      agentsActiveValue.textContent = String(active);
    }
  }

  if (tasksQueueValue) {
    const total = (boardState || []).reduce((acc, c) => {
      const key = normalizeColumnKey(c.name || '');
      if (key === 'done') return acc;
      return acc + (Array.isArray(c.items) ? c.items.length : 0);
    }, 0);
    tasksQueueValue.textContent = String(total);
  }
}

function priorityScore(card) {
  return Number(card.impactRevenue || 0) + Number(card.impactAutonomy || 0) + Number(card.urgency || 0);
}

function inferOwner(text) {
  const t = text.toLowerCase();
  if (/(api|backend|deploy|infra|server|banco|db|código|code|integra)/.test(t)) return 'Thanos';
  if (/(ui|ux|frontend|front|layout|página|design|landing|tela|header|visual)/.test(t)) return 'Wanda';
  if (/(auditoria|auditar|gargalo|dependên|distribui|fluxo|handoff)/.test(t)) return 'Alfred';
  return 'Alfred';
}

function normalizeCard(item) {
  if (Array.isArray(item)) {
    const [title, desc, owner, eta] = item;
    return {
      cardId: makeCardId(title),
      title,
      desc,
      owner,
      eta,
      impactRevenue: 3,
      impactAutonomy: 3,
      urgency: 3,
      approved: owner === 'Thanos' || owner === 'Wanda' || owner === 'Alfred',
      effective: false,
      needsEffectiveness: false,
      kind: 'manual_required',
      targetFile: '',
      expectedChange: '',
      acceptanceTest: '',
      execution: {
        sessionId: null,
        agent: 'Stark',
        startedAt: Date.now(),
        endedAt: null,
        updatedAt: Date.now(),
        status: 'pending',
        evidence: [],
      },
    };
  }
  return {
    id: item.id || item.missionId || item.cardId || makeMissionId(),
    cardId: item.id || item.missionId || item.cardId || makeMissionId(),
    title: item.title || 'Sem título',
    desc: item.desc || '',
    owner: item.owner || 'Stark',
    eta: item.eta || '0m',
    impactRevenue: Number(item.impactRevenue ?? 3),
    impactAutonomy: Number(item.impactAutonomy ?? 3),
    urgency: Number(item.urgency ?? 3),
    approved: Boolean(item.approved),
    effective: Boolean(item.effective),
    needsEffectiveness: Boolean(item.needsEffectiveness),
    executionStatus: item.executionStatus || '',
    needsUserAction: item.needsUserAction || '',
    kind: item.kind || 'manual_required',
    targetFile: item.targetFile || '',
    expectedChange: item.expectedChange || '',
    acceptanceTest: item.acceptanceTest || '',
    clarificationAsked: Boolean(item.clarificationAsked),
    clarificationAnswer: item.clarificationAnswer || '',
    sessionId: item.sessionId || item.execution?.sessionId || '',
    execution: item.execution || {
      sessionId: item.sessionId || '',
      agent: item.owner || 'Stark',
      startedAt: item.createdAt || Date.now(),
      endedAt: null,
      updatedAt: Date.now(),
      status: item.executionStatus || 'pending',
      evidence: Array.isArray(item.effectEvidence) ? item.effectEvidence : [],
    },
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

async function loadTelemetry() {
  try {
    const d = await fetchJson(API.telemetry || '/api/openclaw/telemetry');
    if (Array.isArray(d?.agents)) {
      telemetryState = d;
      return d;
    }
  } catch (_) {}
  return telemetryState;
}

async function checkBackendConnection() {
  let ok = false;
  try {
    const res = await fetch(API.health, { method: 'GET', cache: 'no-store' });
    ok = res.ok;
  } catch (_) {}
  addLiveEvent('Backend', ok ? `Conectado (${API.health})` : `Sem resposta em ${API.health}`);
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

const STRICT_PERSISTENCE = true;
const API = {
  health: localStorage.getItem('mc_api_health') || '/api/health',
  missionBroadcast: localStorage.getItem('mc_api_mission_broadcast') || '/api/missions',
  move: localStorage.getItem('mc_api_move') || '/api/dashboard/move',
  boardState: localStorage.getItem('mc_api_board_state') || '/api/dashboard/state',
  autonomous: localStorage.getItem('mc_api_autonomous') || '/api/autonomous/mode',
  telemetry: localStorage.getItem('mc_api_telemetry') || '/api/openclaw/telemetry',
};

function snapshotBoard() {
  return JSON.parse(JSON.stringify(boardState));
}

function restoreBoard(snapshot) {
  boardState = snapshot;
  renderBoard(boardState);
}

async function apiPost(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function persistMove(payload) {
  return apiPost(API.move, payload);
}

async function persistBroadcastMission(payload) {
  try {
    const res = await fetch(API.missionBroadcast, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, ...data };
  } catch (_) {
    return { ok: false };
  }
}

function makeTransitionId(prefix = 'tr') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function persistBoardState(action, extra = {}) {
  const payload = { action, board: boardState, actor: 'ui', ...extra };
  if (!payload.transitionId && ['move', 'autonomous_move', 'clarification_reply', 'delete_card', 'approve', 'autonomous_approve', 'effectiveness_reopen', 'effectiveness_ok', 'auto_delegate'].includes(action)) {
    payload.transitionId = makeTransitionId(action);
  }
  return apiPost(API.boardState, payload);
}

async function deleteCardReal(missionId, title = '') {
  try {
    const res = await fetch('/api/cards/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId, title }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: Boolean(data.ok), ...data };
  } catch (_) {
    return { ok: false };
  }
}

async function executeMissionReal(card) {
  try {
    const res = await fetch('/api/missions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId: card.id || card.cardId }),
    });
    if (!res.ok) return { ok: false, evidence: ['endpoint_fail'] };
    return await res.json();
  } catch (_) {
    return { ok: false, evidence: ['network_fail'] };
  }
}

async function loadAgentChat() {
  try {
    const res = await fetch('/api/chat', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.messages) ? data.messages : [];
  } catch (_) {
    return [];
  }
}

function renderAgentChat(messages) {
  if (!chatFeed) return;
  chatFeed.innerHTML = '';
  if (!messages.length) {
    chatFeed.innerHTML = '<p class="muted">Sem mensagens ainda.</p>';
    return;
  }
  messages.slice().reverse().forEach((m) => {
    const item = document.createElement('article');
    item.className = 'feed-item';
    item.innerHTML = `<strong>${escapeHtml(m.from || 'Agente')}</strong><p>${escapeHtml(m.text || '')}</p>`;
    chatFeed.appendChild(item);
  });
}

async function refreshAgentChat() {
  const msgs = await loadAgentChat();
  renderAgentChat(msgs);
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
  addLiveEvent('Modo autônomo', enabled ? 'Ativado' : 'Desativado', true);
  if (enabled) autonomousTick();
  const ok = await apiPost(API.autonomous, { enabled, auto_exec_enabled: enabled });
  if (STRICT_PERSISTENCE && !ok) {
    showToast('Falha ao persistir modo autônomo no backend');
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

  const workOwners = new Set();
  const inProgress = getColumn('in_progress')?.items || [];
  const assigned = getColumn('assigned')?.items || [];
  [...inProgress, ...assigned].forEach((m) => {
    const n = (normalizeCard(m).owner || '').toLowerCase();
    if (n) workOwners.add(n);
  });
  const telemetryMap = new Map((telemetryState?.agents || []).map((a) => [String(a.agentId || '').toLowerCase(), a]));

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
      const tele = telemetryMap.get((agent.id || agent.name || '').toLowerCase());
      const telemetryStatus = tele?.status === 'working' ? 'trabalhando' : (tele?.status === 'idle' ? 'idle' : null);
      const computedStatus = telemetryStatus || (workOwners.has((agent.name || '').toLowerCase()) ? 'trabalhando' : (agent.status || 'online'));
      const statusClass = (computedStatus || '').toLowerCase().replace(/\s+/g, '-');
      const item = document.createElement('article');
      item.className = `agent-item ${agent.id === selectedAgentId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="agent-icon">${escapeHtml(agent.icon)}</div>
        <div class="agent-main"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.role)}</span></div>
        <div class="status ${escapeHtml(statusClass)}"><span class="status-dot"></span>${escapeHtml(computedStatus)}</div>
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
  updateHeaderMetrics();
}

function serializeCard(card) {
  return {
    id: card.dataset.missionId || card.dataset.cardId,
    cardId: card.dataset.missionId || card.dataset.cardId,
    title: card.dataset.title,
    desc: card.dataset.desc,
    owner: card.dataset.owner,
    eta: card.dataset.eta,
    impactRevenue: Number(card.dataset.impactRevenue || 0),
    impactAutonomy: Number(card.dataset.impactAutonomy || 0),
    urgency: Number(card.dataset.urgency || 0),
    approved: card.dataset.approved === '1',
    effective: card.dataset.effective === '1',
    needsEffectiveness: card.dataset.needsEffectiveness === '1',
    executionStatus: card.dataset.executionStatus || '',
    needsUserAction: card.dataset.needsUserAction || '',
    kind: card.dataset.kind || 'manual_required',
    targetFile: card.dataset.targetFile || '',
    expectedChange: card.dataset.expectedChange || '',
    acceptanceTest: card.dataset.acceptanceTest || '',
    clarificationAsked: card.dataset.clarificationAsked === '1',
    clarificationAnswer: card.dataset.clarificationAnswer || '',
    sessionId: card.dataset.sessionId || '',
    execution: {
      sessionId: card.dataset.sessionId || '',
      agent: card.dataset.executionAgent || card.dataset.owner || 'Stark',
      startedAt: Number(card.dataset.executionStartedAt || Date.now()),
      endedAt: card.dataset.executionEndedAt ? Number(card.dataset.executionEndedAt) : null,
      updatedAt: Number(card.dataset.executionUpdatedAt || Date.now()),
      status: card.dataset.executionStatus || 'pending',
      evidence: (() => { try { return JSON.parse(card.dataset.executionEvidence || '[]'); } catch (_) { return []; } })(),
    },
  };
}

function createCard(item, columnKey = '') {
  const c = normalizeCard(item);
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;
  card.dataset.missionId = c.id || c.cardId || makeMissionId();
  card.dataset.cardId = card.dataset.missionId;
  card.dataset.title = c.title;
  card.dataset.desc = c.desc;
  card.dataset.owner = c.owner;
  card.dataset.eta = c.eta;
  card.dataset.impactRevenue = String(c.impactRevenue);
  card.dataset.impactAutonomy = String(c.impactAutonomy);
  card.dataset.urgency = String(c.urgency);
  card.dataset.approved = c.approved ? '1' : '0';
  card.dataset.effective = c.effective ? '1' : '0';
  card.dataset.needsEffectiveness = c.needsEffectiveness ? '1' : '0';
  card.dataset.executionStatus = c.executionStatus || '';
  card.dataset.needsUserAction = c.needsUserAction || '';
  card.dataset.kind = c.kind || 'manual_required';
  card.dataset.targetFile = c.targetFile || '';
  card.dataset.expectedChange = c.expectedChange || '';
  card.dataset.acceptanceTest = c.acceptanceTest || '';
  card.dataset.clarificationAsked = c.clarificationAsked ? '1' : '0';
  card.dataset.clarificationAnswer = c.clarificationAnswer || '';
  card.dataset.sessionId = c.sessionId || c.execution?.sessionId || '';
  card.dataset.executionAgent = c.execution?.agent || c.owner || 'Stark';
  card.dataset.executionStartedAt = String(c.execution?.startedAt || Date.now());
  card.dataset.executionEndedAt = c.execution?.endedAt ? String(c.execution.endedAt) : '';
  card.dataset.executionUpdatedAt = String(c.execution?.updatedAt || Date.now());
  card.dataset.executionEvidence = JSON.stringify(Array.isArray(c.execution?.evidence) ? c.execution.evidence : (Array.isArray(c.effectEvidence) ? c.effectEvidence : []));

  const score = priorityScore(c);
  const approveBtn = c.approved
    ? `<span class="chip mini approved">Aprovado</span>`
    : `<button class="chip mini" data-action="approve">Aprovar (Jarvis)</button>`;
  const effectiveness = c.effective
    ? `<span class="chip mini approved">Efetiva</span>`
    : (c.needsEffectiveness ? `<span class="chip mini">Revisão de efetividade</span>` : `<span class="chip mini">Efetividade pendente</span>`);
  const executionBadge = c.executionStatus ? `<span class="chip mini">${escapeHtml(c.executionStatus)}</span>` : '';
  const oracleBadge = '';
  const clarifyBtn = '';
  const deleteBtn = `<button class="chip mini danger" data-action="delete">Excluir</button>`;

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
    <div class="approve-row">${approveBtn} ${effectiveness} ${executionBadge} ${oracleBadge}</div>
    ${c.needsUserAction ? `<div class="empty-column" style="margin-top:8px">Ação necessária: ${escapeHtml(c.needsUserAction)}</div>` : ''}
    <div class="card-actions">${clarifyBtn} ${deleteBtn}</div>
  `;

  card.querySelector('[data-action="approve"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const before = snapshotBoard();
    card.dataset.approved = '1';
    const row = card.querySelector('.approve-row');
    if (row) row.innerHTML = `<span class="chip mini approved">Aprovado</span>`;
    const ok = await persistBoardState('approve', { missionId: card.dataset.missionId || card.dataset.cardId, title: card.dataset.title });
    if (STRICT_PERSISTENCE && !ok) {
      showToast('Falha ao persistir aprovação no backend');
      restoreBoard(before);
      return;
    }
    addLiveEvent('Jarvis aprovou missão', card.dataset.title || 'Missão sem título', true, { missionKey: card.dataset.cardId || card.dataset.title, missionTitle: card.dataset.title });
  });

  card.querySelector('[data-action="clarify"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const answer = prompt(
      'Resposta de clarificação (pode colar em formato OBJETIVO / ARQUIVO-ALVO / SUCESSO):',
      card.dataset.clarificationAnswer || ''
    );
    if (answer == null) return;
    const text = answer.trim();
    if (!text) {
      showToast('Resposta vazia. Nada foi alterado.');
      return;
    }

    const before = snapshotBoard();
    const currentCol = card.closest('.column')?.dataset.column || 'failed';
    const assignedCol = ensureColumn('assigned', 'Assigned');

    let moved = null;
    for (const col of boardState) {
      const idx = (col.items || []).findIndex((x) => normalizeCard(x).cardId === card.dataset.cardId);
      if (idx >= 0) {
        const original = normalizeCard(col.items.splice(idx, 1)[0]);
        moved = {
          ...original,
          desc: `${original.desc}\n\n[Clarificação do Monarca]\n${text}`,
          clarificationAnswer: text,
          needsUserAction: '',
          executionStatus: 'clarified',
          clarificationAsked: false,
        };
        break;
      }
    }

    if (!moved) {
      showToast('Não consegui localizar o card no board.');
      restoreBoard(before);
      return;
    }

    assignedCol.items = [moved, ...(assignedCol.items || [])];
    renderBoard(boardState);

    const ok = await persistBoardState('clarification_reply', {
      missionId: card.dataset.missionId || card.dataset.cardId,
      cardId: card.dataset.cardId,
      title: card.dataset.title,
      fromColumn: currentCol,
      toColumn: 'assigned',
      clarification: text,
    });

    if (STRICT_PERSISTENCE && !ok) {
      showToast('Falha ao salvar resposta de clarificação no backend');
      restoreBoard(before);
      return;
    }

    addLiveEvent('Monarca respondeu clarificação', `${card.dataset.title}: voltou para Assigned.`, true, {
      missionKey: card.dataset.cardId || card.dataset.title,
      missionTitle: card.dataset.title,
    });
  });

  card.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const okConfirm = confirm(`Excluir card "${card.dataset.title || 'Sem título'}"?`);
    if (!okConfirm) return;

    const before = snapshotBoard();
    let fromColumn = 'unknown';
    let removed = false;

    for (const col of boardState) {
      const idx = (col.items || []).findIndex((x) => normalizeCard(x).cardId === card.dataset.cardId);
      if (idx >= 0) {
        col.items.splice(idx, 1);
        fromColumn = normalizeColumnKey(col.name || 'unknown');
        removed = true;
        break;
      }
    }

    if (!removed) {
      showToast('Não consegui excluir: card não encontrado.');
      restoreBoard(before);
      return;
    }

    renderBoard(boardState);

    const del = await deleteCardReal(card.dataset.missionId || card.dataset.cardId, card.dataset.title || '');
    const okState = await persistBoardState('delete_card', { missionId: card.dataset.missionId || card.dataset.cardId, title: card.dataset.title, fromColumn });

    if (STRICT_PERSISTENCE && (!del.ok || !okState)) {
      showToast('Falha ao excluir card no backend');
      restoreBoard(before);
      return;
    }

    const dashboard = await loadDashboard();
    renderBoard(dashboard.columns || fallbackData.columns);

    addLiveEvent('Card excluído', `${card.dataset.title} removido de ${prettyColumn(fromColumn)}.`, true, {
      missionKey: card.dataset.cardId || card.dataset.title,
      missionTitle: card.dataset.title,
    });
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
    const currentCol = card.closest('.column')?.dataset.column || '';
    const replacement = createCard(data, currentCol);
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

    const columnKey = normalizeColumnKey(col.name);
    const normalized = (col.items || []).map(normalizeCard).sort((a, b) => priorityScore(b) - priorityScore(a));
    normalized.forEach((item) => cards.appendChild(createCard(item, columnKey)));
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

      const before = snapshotBoard();
      const fromColumn = draggedCard.closest('.column')?.dataset.column || null;
      const toColumn = column.dataset.column;

      if (toColumn === 'in_progress' && draggedCard.dataset.approved !== '1') {
        notify('Gate Jarvis: esta missão precisa estar aprovada antes de ir para In Progress.');
        return;
      }

      if (toColumn === 'done') {
        const cardData = serializeCard(draggedCard);
        if (!hasExecutionProof(cardData)) {
          showToast('Done bloqueado: falta executionProof (status effective + evidence).');
          return;
        }
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
      const okMove = await persistMove({ cardId: draggedCard.dataset.cardId, title: draggedCard.dataset.title, fromColumn, toColumn, toIndex });
      const okBoard = await persistBoardState('move', { missionId: draggedCard.dataset.missionId || draggedCard.dataset.cardId, cardId: draggedCard.dataset.cardId, fromColumn, toColumn, toIndex });
      if (STRICT_PERSISTENCE && (!okMove || !okBoard)) {
        showToast('Falha ao persistir movimentação no backend');
        restoreBoard(before);
        return;
      }
      addLiveEvent('Movimentação de missão', `${draggedCard.dataset.title || 'Missão'}: ${prettyColumn(fromColumn || 'desconhecido')} → ${prettyColumn(toColumn || 'desconhecido')}`, true, { missionKey: draggedCard.dataset.cardId || draggedCard.dataset.title, missionTitle: draggedCard.dataset.title });
    });

    column.innerHTML = `<header class="column-head"><span>${escapeHtml(col.name)}</span><span>${normalized.length}</span></header>`;
    column.appendChild(cards);
    kanban.appendChild(column);
  });

  updateHeaderMetrics();
}

function getColumn(key) {
  return boardState.find((c) => normalizeColumnKey(c.name) === key);
}

function ensureColumn(key, label) {
  let col = getColumn(key);
  if (!col) {
    col = { name: label, items: [] };
    boardState.push(col);
  }
  return col;
}

async function autoDelegateInbox(silent = false) {
  const assignedCol = getColumn('assigned');
  if (!assignedCol) return;

  const total = inboxMissions.length;
  if (!total) {
    if (!silent) notify('Inbox está vazio.');
    return;
  }

  const before = snapshotBoard();
  const delegated = inboxMissions.map((m) => ({
    ...normalizeCard(m),
    owner: inferOwner(`${m.title} ${m.desc}`),
  }));

  assignedCol.items = [...delegated, ...(assignedCol.items || [])];
  inboxMissions = [];
  const inboxCol = getColumn('inbox');
  if (inboxCol) inboxCol.items = [];

  renderBoard(boardState);
  const ok = await persistBoardState('auto_delegate', { count: total });
  if (STRICT_PERSISTENCE && !ok) {
    showToast('Falha ao persistir auto-delegação no backend');
    restoreBoard(before);
    return;
  }

  if (!silent) notify(`Auto-delegação concluída: ${total} missão(ões).`);
  addLiveEvent('Stark auto-delegou inbox', `${total} missão(ões) encaminhadas para Assigned.`, true);
}

async function moveOneMission(fromKey, toKey, transform = (x) => x) {
  const from = getColumn(fromKey);
  const to = getColumn(toKey);
  if (!from || !to || !(from.items || []).length) return false;

  const before = snapshotBoard();
  const item = normalizeCard(from.items.shift());
  if (toKey === 'done' && !hasExecutionProof(item)) {
    const fallbackKey = 'failed';
    const target = ensureColumn(fallbackKey, 'Failed');
    target.items.unshift({
      ...item,
      effective: false,
      needsEffectiveness: true,
      executionStatus: 'failed',
      needsClarification: false,
      needsUserAction: 'Falta executionProof. Adicione evidências reais antes de concluir.',
      execution: {
        ...(item.execution || {}),
        status: 'failed',
        updatedAt: Date.now(),
        endedAt: Date.now(),
      },
    });
    renderBoard(boardState);
    await persistBoardState('effectiveness_reopen', { missionId: item.id || item.cardId, title: item.title, owner: 'Alfred' });
    addLiveEvent('Done bloqueado sem proof', `${item.title} foi redirecionada para ${prettyColumn(fallbackKey)}.`, true, { missionKey: item.id || item.cardId, missionTitle: item.title });
    return true;
  }
  to.items.unshift(transform(item));
  renderBoard(boardState);

  const ok = await persistBoardState('autonomous_move', { missionId: item.id || item.cardId, title: item.title, desc: item.desc, owner: item.owner, from: fromKey, to: toKey });
  if (STRICT_PERSISTENCE && !ok) {
    showToast('Falha ao persistir fluxo autônomo no backend');
    restoreBoard(before);
    return false;
  }

  addLiveEvent('Fluxo autônomo', `${item.title}: ${prettyColumn(fromKey)} → ${prettyColumn(toKey)}`, true, { missionKey: item.cardId || makeCardId(item.title), missionTitle: item.title });
  return true;
}

async function autonomousTick() {
  const autonomousOn = localStorage.getItem('mc_autonomous') === '1';
  if (!autonomousOn) return;

  // 0) Garantia Alfred: se algo caiu em done sem efetividade, reabre para Alfred
  const doneCol = getColumn('done');
  if (doneCol?.items?.length) {
    const idx = doneCol.items.findIndex((x) => !normalizeCard(x).effective);
    if (idx >= 0) {
      const before = snapshotBoard();
      const item = normalizeCard(doneCol.items.splice(idx, 1)[0]);
      const assigned = getColumn('assigned');
      if (assigned) {
        assigned.items.unshift({ ...item, owner: 'Alfred', approved: true, needsEffectiveness: true });
        renderBoard(boardState);
        const ok = await persistBoardState('effectiveness_reopen', { missionId: item.id || item.cardId, title: item.title, owner: 'Alfred' });
        if (STRICT_PERSISTENCE && !ok) {
          showToast('Falha ao persistir reabertura de efetividade');
          restoreBoard(before);
          return;
        }
        addLiveEvent('Alfred reabriu missão', `${item.title} voltou para Assigned por falta de efetividade.`, true, { missionKey: item.cardId || makeCardId(item.title), missionTitle: item.title });
        return;
      }
    }
  }

  if (inboxMissions.length) {
    await autoDelegateInbox(true);
    return;
  }

  const assigned = getColumn('assigned');
  if (assigned?.items?.length) {
    const first = normalizeCard(assigned.items[0]);
    if (!first.approved) {
      const before = snapshotBoard();
      assigned.items[0] = { ...first, approved: true };
      renderBoard(boardState);
      const ok = await persistBoardState('autonomous_approve', { missionId: first.id || first.cardId, title: first.title });
      if (STRICT_PERSISTENCE && !ok) {
        showToast('Falha ao persistir aprovação automática no backend');
        restoreBoard(before);
        return;
      }
      addLiveEvent('Jarvis aprovou missão', first.title, true, { missionKey: first.cardId || makeCardId(first.title), missionTitle: first.title });
      return;
    }
    if (await moveOneMission('assigned', 'in_progress')) return;
  }

  const inProgress = getColumn('in_progress');
  if (inProgress?.items?.length) {
    const first = normalizeCard(inProgress.items[0]);
    if (!first.effective) {
      const before = snapshotBoard();
      const exec = await executeMissionReal(first);
      if (!exec.ok) {
        const status = exec.status || 'failed';
        const needsUserAction = exec.needsUserAction || 'Defina melhor o escopo e critério de sucesso.';
        addLiveEvent('Execução real falhou', `${first.title} não teve efetividade real (${(exec.evidence || []).join(', ')}).`, true, { missionKey: first.cardId || makeCardId(first.title), missionTitle: first.title });
        inProgress.items.shift();
        const target = status === 'needs_monarca_decision'
          ? ensureColumn('needs_monarca_decision', 'Needs Monarca Decision')
          : ensureColumn('failed', 'Failed');

        const failStatus = status === 'needs_clarification' ? 'failed' : status;
        target.items.unshift({
          ...first,
          effective: false,
          needsEffectiveness: true,
          needsClarification: false,
          owner: 'Alfred',
          executionStatus: failStatus,
          needsUserAction,
          clarificationAsked: false,
          execution: {
            ...(first.execution || {}),
            status: failStatus,
            updatedAt: Date.now(),
            endedAt: Date.now(),
            evidence: Array.isArray(exec.evidence) ? exec.evidence : (Array.isArray(first.execution?.evidence) ? first.execution.evidence : []),
          },
        });

        renderBoard(boardState);
        const persisted = await persistBoardState('effectiveness_reopen', { missionId: first.id || first.cardId, title: first.title, owner: 'Alfred' });
        if (STRICT_PERSISTENCE && !persisted) restoreBoard(before);
        return;
      }

      inProgress.items[0] = {
        ...first,
        effective: true,
        needsEffectiveness: false,
        executionStatus: 'effective',
        needsUserAction: '',
      };
      renderBoard(boardState);
      await persistBoardState('effectiveness_ok', { missionId: first.id || first.cardId, title: first.title });
      addLiveEvent('Efetividade confirmada', `${first.title} validada com evidência real.`, true, { missionKey: first.cardId || makeCardId(first.title), missionTitle: first.title });
      return;
    }

    if (await moveOneMission('in_progress', 'review')) return;
  }

  await moveOneMission('review', 'done');
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
    const [agents] = await Promise.all([loadAgentsDetails(), loadTelemetry()]);
    if (agents.length) renderAgents(agents);
    if (chatDrawer?.classList.contains('open')) await refreshAgentChat();
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

  autoDelegateBtn?.addEventListener('click', () => autoDelegateInbox());
  inboxChip?.addEventListener('click', () => {
    broadcastDrawer.classList.add('open');
    settingsDrawer.classList.remove('open');
  });

  openBroadcastBtn?.addEventListener('click', () => {
    broadcastDrawer.classList.add('open');
    settingsDrawer.classList.remove('open');
    chatDrawer?.classList.remove('open');
  });

  openChatBtn?.addEventListener('click', async () => {
    chatDrawer?.classList.add('open');
    broadcastDrawer?.classList.remove('open');
    settingsDrawer?.classList.remove('open');
    await refreshAgentChat();
  });
  closeChatBtn?.addEventListener('click', () => chatDrawer?.classList.remove('open'));
  sendChatBtn?.addEventListener('click', async () => {
    const from = (chatFromInput?.value || 'Stark').trim();
    const text = (chatTextInput?.value || '').trim();
    if (!text) return;
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, text }),
      });
      if (!res.ok) {
        showToast('Falha ao enviar mensagem no chat');
        return;
      }
      chatTextInput.value = '';
      await refreshAgentChat();
    } catch (_) {
      showToast('Falha ao enviar mensagem no chat');
    }
  });
  closeBroadcastBtn?.addEventListener('click', () => broadcastDrawer.classList.remove('open'));

  sendBroadcastBtn?.addEventListener('click', async () => {
    const title = missionTitleInput.value.trim();
    const desc = missionDescInput.value.trim();
    if (!title || !desc) {
      notify('Preencha título e descrição da missão.');
      return;
    }

    const priority = (missionPriorityInput?.value || 'p2').trim();
    const weights = priority === 'p1'
      ? { impactRevenue: 5, impactAutonomy: 5, urgency: 5 }
      : priority === 'p3'
        ? { impactRevenue: 2, impactAutonomy: 2, urgency: 2 }
        : { impactRevenue: 3, impactAutonomy: 3, urgency: 3 };

    const missionId = makeMissionId();
    const card = {
      id: missionId,
      missionId,
      cardId: missionId,
      title,
      desc,
      priority,
      owner: 'Stark',
      eta: missionEtaInput.value.trim() || 'agora',
      ...weights,
      approved: false,
      kind: '',
      targetFile: '',
      expectedChange: '',
      acceptanceTest: '',
    };

    const created = await persistBroadcastMission(card);
    if (STRICT_PERSISTENCE && !created.ok) {
      showToast('Falha ao persistir missão no backend');
      return;
    }

    addMissionToInbox(card);
    const boardOk = await persistBoardState('broadcast_inbox', { title: card.title, missionId: card.id || card.cardId });
    if (STRICT_PERSISTENCE && !boardOk) {
      showToast('Falha ao persistir estado do board no backend');
      return;
    }
    addLiveEvent('Broadcast recebeu missão', `${card.title} entrou no Inbox para execução.`, true, { missionKey: card.cardId || makeCardId(card.title), missionTitle: card.title });

    missionTitleInput.value = '';
    missionDescInput.value = '';
    broadcastDrawer.classList.remove('open');
  });

  openSettingsBtn.addEventListener('click', () => {
    settingsDrawer.classList.add('open');
    broadcastDrawer.classList.remove('open');
    chatDrawer?.classList.remove('open');
  });
  closeSettingsBtn.addEventListener('click', () => settingsDrawer.classList.remove('open'));
  settingsTabButtons.forEach((btn) => btn.addEventListener('click', () => setSettingsTab(btn.dataset.tab)));

  const autonomous = localStorage.getItem('mc_autonomous') === '1';
  autonomousToggle.checked = autonomous;
  autonomousStatus.textContent = autonomous ? 'Modo autônomo ativado.' : 'Modo autônomo desativado.';
  setAutonomousVisuals(autonomous);
  autonomousToggle.addEventListener('change', () => saveAutonomousMode(autonomousToggle.checked));

  refreshSecondsInput.value = String(Math.round(refreshMs / 1000));
  apiHealthInput.value = API.health;
  apiBroadcastInput.value = API.missionBroadcast;
  apiMoveInput.value = API.move;
  apiBoardStateInput.value = API.boardState;
  apiAutonomousInput.value = API.autonomous;

  saveGeneralBtn.addEventListener('click', async () => {
    const secs = Math.max(5, Number(refreshSecondsInput.value || 15));
    refreshMs = secs * 1000;
    localStorage.setItem('mc_refresh_ms', String(refreshMs));

    API.health = (apiHealthInput.value || '/api/health').trim();
    API.missionBroadcast = (apiBroadcastInput.value || '/api/missions').trim();
    API.move = (apiMoveInput.value || '/api/dashboard/move').trim();
    API.boardState = (apiBoardStateInput.value || '/api/dashboard/state').trim();
    API.autonomous = (apiAutonomousInput.value || '/api/autonomous/mode').trim();

    localStorage.setItem('mc_api_health', API.health);
    localStorage.setItem('mc_api_mission_broadcast', API.missionBroadcast);
    localStorage.setItem('mc_api_move', API.move);
    localStorage.setItem('mc_api_board_state', API.boardState);
    localStorage.setItem('mc_api_autonomous', API.autonomous);

    startRealtimeRefresh();
    await checkBackendConnection();
    showToast('Configurações salvas');
  });
}

async function init() {
  setupUI();
  renderLiveFeed();
  setLiveTab('history');
  await checkBackendConnection();
  const [dashboard, agents] = await Promise.all([loadDashboard(), loadAgentsDetails(), loadMission(), loadTelemetry()]);
  renderBoard(dashboard.columns || fallbackData.columns);
  if (agents.length) renderAgents(agents);
  addLiveEvent('Live inicializado', 'Histórico pronto para acompanhar o que foi feito.');
  startRealtimeRefresh();
  startAutonomyLoop();
}

init();
