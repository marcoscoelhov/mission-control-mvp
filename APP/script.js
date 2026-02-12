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
const failedBell = document.getElementById('failed-bell');
const failedCountEl = document.getElementById('failed-count');
const openBroadcastBtn = document.getElementById('open-broadcast');
const broadcastDrawer = document.getElementById('broadcast-drawer');
const closeBroadcastBtn = document.getElementById('close-broadcast');
const sendBroadcastBtn = document.getElementById('send-broadcast');
const openChatBtn = document.getElementById('open-chat');
const chatDrawer = document.getElementById('chat-drawer');
const closeChatBtn = document.getElementById('close-chat');
const chatFeed = document.getElementById('chat-feed');
const cmdToInput = document.getElementById('cmd-to');
const cmdTextInput = document.getElementById('cmd-text');
const cmdRiskInput = document.getElementById('cmd-risk');
const cmdSuccessInput = document.getElementById('cmd-success');
const sendCmdBtn = document.getElementById('send-cmd');
const cmdFeed = document.getElementById('cmd-feed');

const agentCfgTabs = [...document.querySelectorAll('#chat-drawer .settings-tabs .chip')];
const cmdTab = document.getElementById('tab-commands');
const agentCfgTab = document.getElementById('tab-agentcfg');

const agentCfgId = document.getElementById('agentcfg-id');
const agentCfgEnabled = document.getElementById('agentcfg-enabled');
const agentCfgNotes = document.getElementById('agentcfg-notes');
const saveAgentCfgBtn = document.getElementById('save-agentcfg');
const missionTitleInput = document.getElementById('mission-title');
const missionDescInput = document.getElementById('mission-desc');
const missionTypeInput = document.getElementById('mission-type');
const missionRiskInput = document.getElementById('mission-risk');
const missionSuccessInput = document.getElementById('mission-success');
const missionProofInput = document.getElementById('mission-proof');
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

const boardFilterBar = document.querySelector('.board-filters');
const boardFilterButtons = [...document.querySelectorAll('.board-filters .chip')];

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
let showFailedOnly = false;
let boardFilter = localStorage.getItem('mc_board_filter') || 'all';

let lastMissionColumn = {};
let lastTransitionBurstAt = 0;

let lastSeenTransitionTs = Number(localStorage.getItem('mc_last_transition_ts') || 0);
let seenTransitionIds = new Set();
let mobileStageCollapsed = (() => {
  try { return JSON.parse(localStorage.getItem('mc_mobile_stage_collapsed') || '{}'); } catch (_) { return {}; }
})();

const normalizeColumnKey = (name = '') => name.toLowerCase().trim().replace(/\s+/g, '_');
const prettyColumn = (key = '') => {
  const k = String(key || '').toLowerCase().trim();
  const map = {
    inbox: 'Entrada',
    assigned: 'Delegadas',
    in_progress: 'Executando',
    review: 'Em revisão',
    done: 'Concluídas',
    failed: 'Falharam',
    blocked: 'Bloqueadas',
    proof_pending: 'Proof pendente',
    awaiting_monarca: 'Aguardando você',
  };
  if (map[k]) return map[k];
  return k.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};
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

function columnCounts(columns) {
  const out = { inbox: 0, assigned: 0, in_progress: 0, review: 0, done: 0, failed: 0 };
  (columns || []).forEach((c) => {
    const k = normalizeColumnKey(c.name || '');
    if (!out.hasOwnProperty(k)) return;
    out[k] = Array.isArray(c.items) ? c.items.length : 0;
  });
  out.inbox = Array.isArray(inboxMissions) ? inboxMissions.length : 0;
  return out;
}

function setActiveFilterButton(labelNeedle = '') {
  const needle = String(labelNeedle).toLowerCase().trim();
  boardFilterButtons.forEach((btn) => {
    const t = (btn.textContent || '').toLowerCase();
    const is = needle && t.includes(needle);
    btn.classList.toggle('active', is);
  });
}

function applyMobileFilter(columns) {
  const byKey = new Map((columns || []).map((c) => [normalizeColumnKey(c.name || ''), c]));
  const filter = showFailedOnly ? 'failed' : boardFilter;
  const wanted =
    filter === 'active'
      ? ['in_progress', 'assigned', 'review', 'awaiting_monarca', 'proof_pending']
      : filter === 'assigned'
        ? ['assigned']
        : filter === 'review'
          ? ['review']
          : filter === 'done'
            ? ['done']
            : filter === 'failed'
              ? ['failed']
              : filter === 'waiting'
                ? ['awaiting_monarca', 'proof_pending', 'failed']
                : ['in_progress', 'assigned', 'review', 'awaiting_monarca', 'proof_pending', 'done'];

  const out = wanted.map((k) => byKey.get(k)).filter(Boolean);
  return out.length ? out : (columns || []).filter((c) => normalizeColumnKey(c.name || '') !== 'inbox');
}

function refreshMobileFilterLabels(counts) {
  if (!boardFilterButtons.length) return;
  const c = counts || {};
  const activeCount = Number(c.in_progress || 0) + Number(c.assigned || 0) + Number(c.review || 0);

  boardFilterButtons.forEach((btn) => {
    const raw = (btn.textContent || '').trim();
    const base = raw.split(':')[0].split('(')[0].trim();
    const key = base.toLowerCase();

    if (key === 'inbox') {
      btn.textContent = `Inbox (${c.inbox || 0})`;
      return;
    }
    if (key === 'assigned') {
      btn.textContent = `Assigned (${c.assigned || 0})`;
      return;
    }
    if (key === 'active') {
      btn.textContent = `Active (${activeCount})`;
      return;
    }
    if (key === 'review') {
      btn.textContent = `Review (${c.review || 0})`;
      return;
    }
    if (key === 'done') {
      btn.textContent = `Done (${c.done || 0})`;
      return;
    }
    if (key === 'waiting') {
      btn.textContent = `Waiting (${c.failed || 0})`;
      btn.style.display = (c.failed || 0) > 0 ? 'inline-flex' : 'none';
      return;
    }
    if (key === 'all') {
      const total = Number(c.in_progress || 0) + Number(c.assigned || 0) + Number(c.review || 0) + Number(c.done || 0);
      btn.textContent = `All (${total})`;
    }
  });
}

function notify(msg) {
  console.log(msg);
  showToast(String(msg || ''));
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

function detectAndLogTransitions(columns) {
  const now = Date.now();
  const next = {};
  const changes = [];

  (columns || []).forEach((col) => {
    const key = normalizeColumnKey(col.name || '');
    (col.items || []).forEach((m) => {
      const c = normalizeCard(m);
      const id = c.id || c.cardId;
      if (!id) return;
      next[id] = key;
      const prev = lastMissionColumn[id];
      if (prev && prev !== key) {
        changes.push({ id, title: c.title || 'Missão', from: prev, to: key });
      }
    });
  });

  lastMissionColumn = next;

  // Avoid spamming on big refreshes; log only small bursts.
  if (changes.length && (now - lastTransitionBurstAt) > 1200) {
    changes.slice(0, 5).forEach((ch) => {
      addLiveEvent('Fluxo', `${ch.title}: ${prettyColumn(ch.from)} → ${prettyColumn(ch.to)}`, true, {
        missionKey: ch.id,
        missionTitle: ch.title,
      });
    });
    lastTransitionBurstAt = now;
  }
}

function ingestDashboardTransitions(dashboard) {
  const cols = dashboard?.columns || [];
  let maxTs = lastSeenTransitionTs;

  (cols || []).forEach((col) => {
    const toKey = normalizeColumnKey(col.name || '');
    (col.items || []).forEach((m) => {
      const c = normalizeCard(m);
      const lt = c.latestTransition;
      if (!lt || !lt.id) return;
      const ts = Number(lt.timestamp || 0);
      if (!ts) return;
      maxTs = Math.max(maxTs, ts);
      if (ts <= lastSeenTransitionTs) return;
      if (seenTransitionIds.has(lt.id)) return;
      seenTransitionIds.add(lt.id);

      const from = normalizeColumnKey(lt.from || '?');
      const to = normalizeColumnKey(lt.to || toKey);
      const actor = lt.actor || 'system';
      const reason = lt.reason || 'update';
      addLiveEvent('Fluxo', `${c.title}: ${prettyColumn(from)} → ${prettyColumn(to)} (${actor})`, true, {
        missionKey: c.id,
        missionTitle: c.title,
      });
    });
  });

  if (maxTs > lastSeenTransitionTs) {
    lastSeenTransitionTs = maxTs;
    localStorage.setItem('mc_last_transition_ts', String(lastSeenTransitionTs));
  }
}

function pulseFlow() {
  kanban.classList.remove('flow-active');
  void kanban.offsetWidth;
  kanban.classList.add('flow-active');
  setTimeout(() => kanban.classList.remove('flow-active'), 1300);
}

async function renderMissionHistory(key) {
  if (!missionHistoryView) return;
  const missionId = String(key || '').trim();
  if (!missionId || missionId === 'system') {
    missionHistoryView.textContent = 'Selecione uma missão para ver o trajeto completo.';
    return;
  }

  // Prefer backend timeline (source of truth).
  try {
    const res = await fetchJson(`/api/missions/${encodeURIComponent(missionId)}/timeline`);
    const tl = Array.isArray(res?.timeline) ? res.timeline : [];
    const proof = res?.executionProof || {};

    const header = [];
    const status = proof.status ? String(proof.status) : '—';
    const ev = Array.isArray(proof.evidence) ? proof.evidence : [];
    header.push(`PROOF: ${status} | evidências: ${ev.length}`);
    if (proof.agent) header.push(`AGENTE: ${proof.agent}`);
    if (proof.sessionId) header.push(`SESSION: ${proof.sessionId}`);

    const evLines = ev.length
      ? ['EVIDÊNCIAS:', ...ev.slice(0, 8).map((x) => `- ${String(x).slice(0, 220)}`)].join('\n')
      : 'EVIDÊNCIAS: (nenhuma)';

    if (!tl.length) {
      missionHistoryView.textContent = `${header.join(' · ')}\n\n${evLines}\n\nSem transições registradas ainda.`;
      return;
    }

    const lines = tl
      .slice()
      .reverse()
      .slice(0, 40)
      .map((e) => {
        const at = new Date(Number(e.timestamp || 0)).toLocaleString('pt-BR');
        const from = prettyColumn(normalizeColumnKey(e.from || '?'));
        const to = prettyColumn(normalizeColumnKey(e.to || '?'));
        const actor = e.actor || 'system';
        const reason = e.reason || 'update';
        return `- [${at}] ${from} → ${to} (${actor}/${reason})`;
      });

    missionHistoryView.textContent = `${header.join(' · ')}\n\n${evLines}\n\nTRAJETO:\n${lines.join('\n')}`;
    return;
  } catch (_) {
    // Fallback to local log
  }

  const logs = activityLog.filter((e) => (e.missionKey || 'system') === missionId);
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
    item.addEventListener('click', async () => {
      selectedMissionKey = key;
      renderLiveFeed();
      await renderMissionHistory(key);
    });
    liveFeed.appendChild(item);
  });

  void renderMissionHistory(selectedMissionKey);
}

function addLiveEvent(title, message, emphasize = false, meta = {}) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const missionKey = meta.missionKey || 'system';
  const missionTitle = meta.missionTitle || null;
  activityLog.unshift({ title, missionTitle, missionKey, message: `${message} • ${time}`, at: Date.now() });
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
      id: makeCardId(title),
      title,
      rawTitle: title,
      requestedTitle: '',
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

  const id = item.id || item.missionId || item.cardId || makeMissionId();
  const rawTitle = item.title || 'Sem título';
  const requestedTitle = item.requestedTitle || '';
  const displayTitle = (requestedTitle && String(rawTitle).startsWith('#task_')) ? requestedTitle : rawTitle;

  return {
    id,
    cardId: id,
    title: displayTitle,
    rawTitle,
    requestedTitle,
    desc: item.desc || '',
    owner: item.owner || 'Stark',
    eta: item.eta || '0m',
    impactRevenue: Number(item.impactRevenue ?? 3),
    impactAutonomy: Number(item.impactAutonomy ?? 3),
    urgency: Number(item.urgency ?? 3),
    missionType: item.missionType || 'Feature',
    riskLevel: Number(item.riskLevel ?? 0),
    successCriteria: item.successCriteria || '',
    proofExpected: item.proofExpected || '',
    monarcaOk: Boolean(item.monarcaOk),

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
    latestTransition: item.latestTransition || null,
    timelineCount: Number(item.timelineCount || 0),
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
  try {
    const d = await fetchJson('/api/dashboard');
    if (Array.isArray(d?.columns)) return d;
  } catch (_) {}
  try {
    return await fetchJson('./data.json');
  } catch (_) {
    return fallbackData;
  }
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
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  } catch (_) {
    return { ok: false, status: 0, data: null };
  }
}

async function persistMove(payload) {
  const res = await apiPost(API.move, payload);
  return res.ok;
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
  if (!payload.transitionId && ['move', 'autonomous_move', 'clarification_reply', 'delete_card', 'approve', 'autonomous_approve', 'monarca_ok', 'effectiveness_reopen', 'effectiveness_ok', 'auto_delegate'].includes(action)) {
    payload.transitionId = makeTransitionId(action);
  }
  const res = await apiPost(API.boardState, payload);
  if (!res.ok && res?.data?.message) {
    showToast(res.data.message);
  }
  return res.ok;
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

async function runMissionReal(card) {
  try {
    const res = await fetch('/api/missions/run', {
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

function setChatTab(tab = 'commands') {
  const t = String(tab || 'commands');
  agentCfgTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === t));
  cmdTab?.classList.toggle('active', t === 'commands');
  agentCfgTab?.classList.toggle('active', t === 'agentcfg');
}

function loadAgentCfg(agentId = 'stark') {
  const raw = localStorage.getItem(`mc_agentcfg_${agentId}`);
  if (!raw) return { enabled: true, notes: '' };
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      notes: String(parsed.notes || ''),
    };
  } catch (_) {
    return { enabled: true, notes: '' };
  }
}

function saveAgentCfg(agentId = 'stark', cfg = {}) {
  localStorage.setItem(`mc_agentcfg_${agentId}`, JSON.stringify(cfg));
}

function renderCmdFeed(lines = []) {
  if (!cmdFeed) return;
  const out = (lines || []).slice(-6);
  cmdFeed.innerHTML = out.length
    ? out.map((l) => `<p class="muted" style="margin:6px 0">${escapeHtml(l)}</p>`).join('')
    : '<p class="muted">Dica: use isso ao invés de “chat”. Vira card rastreável.</p>';
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
  const ok = (await apiPost(API.autonomous, { enabled, auto_exec_enabled: enabled })).ok;
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

function mobileStepperHtml(currentKey = '') {
  const k = normalizeColumnKey(currentKey || '');
  const steps = [
    { key: 'assigned', label: 'Assigned' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'review', label: 'Review' },
    { key: 'done', label: 'Done' },
  ];
  const idx = Math.max(0, steps.findIndex((s) => s.key === k));
  return `
    <div class="stepper" aria-label="Progresso">
      ${steps
        .map((s, i) => `<span class="step ${i <= idx ? 'on' : ''} ${s.key === k ? 'current' : ''}">${s.label}</span>`)
        .join('')}
    </div>
  `;
}

function createCard(item, columnKey = '') {
  const c = normalizeCard(item);
  const card = document.createElement('article');
  card.className = 'card';
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  card.draggable = !isMobile;
  card.dataset.missionId = c.id || c.cardId || makeMissionId();
  card.dataset.cardId = card.dataset.missionId;
  card.dataset.title = c.title;
  card.dataset.desc = c.desc;
  card.dataset.owner = c.owner;
  card.dataset.eta = c.eta;
  card.dataset.impactRevenue = String(c.impactRevenue);
  card.dataset.impactAutonomy = String(c.impactAutonomy);
  card.dataset.urgency = String(c.urgency);
  card.dataset.missionType = String(c.missionType || 'Feature');
  card.dataset.riskLevel = String(c.riskLevel ?? 0);
  card.dataset.successCriteria = String(c.successCriteria || '');
  card.dataset.proofExpected = String(c.proofExpected || '');
  card.dataset.monarcaOk = c.monarcaOk ? '1' : '0';
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
  const risk = Number(c.riskLevel ?? 0);
  const typeBadge = c.missionType ? `<span class="chip mini">${escapeHtml(c.missionType)}</span>` : '';
  const riskBadge = `<span class="chip mini ${risk >= 2 ? 'danger' : risk >= 1 ? 'warning' : ''}">R${risk}</span>`;

  const gatePending = (() => {
    if (risk >= 2 && !c.monarcaOk) return 'OK do Marcos pendente';
    if (risk >= 1 && !c.approved) return 'Aprovação do Jarvis pendente';
    return '';
  })();
  const gateBadge = gatePending ? `<span class="chip mini warning">⛔ ${escapeHtml(gatePending)}</span>` : '';

  const approveBtn = c.approved
    ? `<span class="chip mini approved">Aprovado</span>`
    : `<button class="chip mini" data-action="approve">Aprovar (Jarvis)</button>`;

  const monarcaBtn = risk >= 2
    ? (c.monarcaOk
      ? `<span class="chip mini approved">OK Marcos</span>`
      : `<button class="chip mini" data-action="monarca-ok">OK Marcos</button>`)
    : '';

  const effectiveness = c.effective
    ? `<span class="chip mini approved">Efetiva</span>`
    : (c.needsEffectiveness ? `<span class="chip mini">Revisão de efetividade</span>` : `<span class="chip mini">Efetividade pendente</span>`);

  const executionBadge = c.executionStatus ? `<span class="chip mini">${escapeHtml(c.executionStatus)}</span>` : '';
  const stageBadge = '';
  const oracleBadge = '';
  const respondBtn = (normalizeColumnKey(columnKey) === 'awaiting_monarca' || String(c.needsUserAction || '').toLowerCase().includes('resposta do monarca'))
    ? `<button class="chip mini warning" data-action="respond">Responder agora</button>`
    : '';
  const runBtn = `<button class="chip mini" data-action="run">Executar</button>`;
  const deleteBtn = `<button class="chip mini danger" data-action="delete">Excluir</button>`;

  card.innerHTML = `
    <h3>${escapeHtml(c.title)}</h3>
    ${isMobile ? mobileStepperHtml(columnKey) : ''}
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
    <div class="approve-row">${stageBadge} ${typeBadge} ${riskBadge} ${gateBadge} ${approveBtn} ${monarcaBtn} ${effectiveness} ${executionBadge} ${oracleBadge}</div>
    ${c.needsUserAction ? `<div class="empty-column" style="margin-top:8px">Ação necessária: ${escapeHtml(c.needsUserAction)}</div>` : ''}
    <div class="card-actions">${respondBtn} ${runBtn} ${deleteBtn}</div>
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
    // Persist locally in boardState too (UI is not the source of truth, but helps avoid drift)
    for (const col of boardState) {
      const it = (col.items || []).find((x) => normalizeCard(x).cardId === (card.dataset.cardId || card.dataset.missionId));
      if (it) { it.approved = true; }
    }

    addLiveEvent('Jarvis aprovou missão', card.dataset.title || 'Missão sem título', true, { missionKey: card.dataset.cardId || card.dataset.title, missionTitle: card.dataset.title });
  });

  card.querySelector('[data-action="monarca-ok"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const before = snapshotBoard();

    card.dataset.monarcaOk = '1';
    for (const col of boardState) {
      const it = (col.items || []).find((x) => normalizeCard(x).cardId === (card.dataset.cardId || card.dataset.missionId));
      if (it) { it.monarcaOk = true; }
    }

    const ok = await persistBoardState('monarca_ok', { missionId: card.dataset.missionId || card.dataset.cardId, title: card.dataset.title });
    if (STRICT_PERSISTENCE && !ok) {
      showToast('Falha ao persistir OK do Marcos no backend');
      restoreBoard(before);
      return;
    }

    // Reload to refresh chips
    const dashboard = await loadDashboard();
    renderBoard(dashboard.columns || fallbackData.columns);

    addLiveEvent('OK do Marcos', card.dataset.title || 'Missão sem título', true, { missionKey: card.dataset.cardId || card.dataset.title, missionTitle: card.dataset.title });
  });

  card.querySelector('[data-action="respond"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = prompt(
      'Resposta do Marcos (cole no formato OBJETIVO / ARQUIVO-ALVO / SUCESSO):',
      ''
    );
    if (text == null) return;
    const reply = text.trim();
    if (!reply) {
      showToast('Resposta vazia.');
      return;
    }

    const before = snapshotBoard();
    const fromColumn = card.closest('.column')?.dataset.column || columnKey || 'awaiting_monarca';

    const ok = await persistBoardState('monarca_reply', {
      missionId: card.dataset.missionId || card.dataset.cardId,
      title: card.dataset.title,
      fromColumn,
      reply,
    });

    if (STRICT_PERSISTENCE && !ok) {
      showToast('Falha ao salvar resposta do Marcos');
      restoreBoard(before);
      return;
    }

    const dashboard = await loadDashboard();
    ingestDashboardTransitions(dashboard);
    renderBoard(dashboard.columns || fallbackData.columns);

    addLiveEvent('Resposta do Marcos', `${card.dataset.title}: contexto fornecido.`, true, {
      missionKey: card.dataset.cardId || card.dataset.title,
      missionTitle: card.dataset.title,
    });
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

  card.querySelector('[data-action="run"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();

    const approved = card.dataset.approved === '1';
    const stage = columnKey || card.closest('.column')?.dataset.column || '';
    if (!approved && normalizeColumnKey(stage) !== 'inbox') {
      showToast('Gate Jarvis: aprove a missão antes de executar.');
      return;
    }

    showToast('Executando via LLM...');
    const before = snapshotBoard();
    const missionId = card.dataset.missionId || card.dataset.cardId;
    const res = await runMissionReal({ id: missionId, cardId: missionId });

    if (STRICT_PERSISTENCE && !res.ok) {
      showToast('Execução falhou (sem proof).');
      restoreBoard(before);
      return;
    }

    const dashboard = await loadDashboard();
    ingestDashboardTransitions(dashboard);
    renderBoard(dashboard.columns || fallbackData.columns);

    selectedMissionKey = missionId;
    renderLiveFeed();
    await renderMissionHistory(missionId);

    addLiveEvent('Execução (LLM)', `${card.dataset.title}: ${res.status || 'ok'}`, true, { missionKey: missionId, missionTitle: card.dataset.title });
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

  card.addEventListener('click', async () => {
    if (!isMobile) return;
    // Mobile: tap selects mission + toggles compact/expanded view.
    selectedMissionKey = card.dataset.cardId || selectedMissionKey;
    card.classList.toggle('expanded');
    renderLiveFeed();
    await renderMissionHistory(selectedMissionKey);
    // Keep a visible "peek" of Live; user can expand fully via button.
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

function refreshFailedBell() {
  if (!failedBell || !failedCountEl) return;
  const failed = getColumn('failed')?.items || [];
  const n = Array.isArray(failed) ? failed.length : 0;
  failedCountEl.textContent = String(n);
  failedBell.classList.toggle('has-failures', n > 0);
  failedBell.style.display = (n > 0 || showFailedOnly) ? 'inline-flex' : 'none';
  failedBell.title = showFailedOnly ? 'Voltar ao board' : 'Ver falhas (clique para ver/ocultar)';
}

function renderMobileFlow(columns) {
  // Mobile needs a flow-first view (like desktop), not hidden side panels.
  const ORDER = showFailedOnly
    ? ['failed']
    : ['inbox', 'assigned', 'in_progress', 'review', 'awaiting_monarca', 'proof_pending', 'done', 'failed'];

  const byKey = new Map((columns || []).map((c) => [normalizeColumnKey(c.name), c]));

  const wrap = document.createElement('div');
  wrap.className = 'mobile-flow';

  ORDER.forEach((key) => {
    const col = byKey.get(key);
    if (!col) return;

    const items = (col.items || []).map(normalizeCard).sort((a, b) => priorityScore(b) - priorityScore(a));
    const count = items.length;

    // keep empties collapsed to reduce noise, but show the stage so the flow is readable.
    const defaultCollapsed = count === 0;
    const collapsed = Boolean(mobileStageCollapsed[key] ?? defaultCollapsed);

    const stage = document.createElement('section');
    stage.className = `mobile-stage ${collapsed ? 'collapsed' : ''} ${count === 0 ? 'is-empty' : ''}`;
    stage.dataset.stage = key;

    const head = document.createElement('header');
    head.className = 'mobile-stage-head';
    head.innerHTML = `
      <div class="mobile-stage-title">
        <strong>${escapeHtml(prettyColumn(key))}</strong>
        <span class="mobile-stage-count">${count}</span>
      </div>
      <button class="chip mini" type="button">${collapsed ? 'Abrir' : 'Fechar'}</button>
    `;
    head.addEventListener('click', () => {
      mobileStageCollapsed[key] = !Boolean(mobileStageCollapsed[key]);
      localStorage.setItem('mc_mobile_stage_collapsed', JSON.stringify(mobileStageCollapsed));
      renderBoard(boardState);
    });

    const cards = document.createElement('div');
    cards.className = 'mobile-stage-cards';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-column';
      empty.textContent = `Sem missões em ${prettyColumn(key)}.`;
      cards.appendChild(empty);
    } else {
      items.forEach((item) => cards.appendChild(createCard(item, key)));
    }

    stage.appendChild(head);
    stage.appendChild(cards);
    wrap.appendChild(stage);
  });

  kanban.appendChild(wrap);
}

function renderBoard(columns) {
  boardState = columns.map((c) => ({ name: c.name, items: [...(c.items || [])] }));
  const inboxColumn = boardState.find((c) => normalizeColumnKey(c.name) === 'inbox');
  inboxMissions = [...(inboxColumn?.items || [])].map(normalizeCard);
  refreshInboxChip();

  // Automatically produce Live events when backend state changes (mobile needs this to be intelligible).
  detectAndLogTransitions(boardState.filter((c) => normalizeColumnKey(c.name) !== 'inbox'));

  kanban.innerHTML = '';

  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  refreshFailedBell();

  // UX: if there is something blocked/pending, auto-open Live once so you notice.
  try {
    const blockedKeys = new Set(['awaiting_monarca', 'proof_pending', 'failed']);
    const hasBlocked = (boardState || []).some((c) => blockedKeys.has(normalizeColumnKey(c.name || '')) && (c.items || []).length);
    if (hasBlocked && livePanel && livePanel.classList.contains('collapsed') && localStorage.getItem('mc_live_autounhide') !== '1') {
      livePanel.classList.remove('collapsed');
      workspace?.classList.remove('live-collapsed');
      localStorage.setItem('mc_live_autounhide', '1');
      setLiveTab('history');
    }
  } catch (_) {}

  if (isMobile) {
    const counts = columnCounts(boardState);
    refreshMobileFilterLabels(counts);
    setActiveFilterButton((showFailedOnly || boardFilter === 'failed') ? 'waiting' : boardFilter);

    // In mobile, render a readable pipeline view (stages + collapse) and let filters reduce noise.
    const filtered = applyMobileFilter(boardState);
    const inbox = boardState.find((c) => normalizeColumnKey(c.name) === 'inbox');
    const mobileCols = [inbox, ...filtered].filter(Boolean);
    renderMobileFlow(mobileCols);
    updateHeaderMetrics();
    return;
  }

  const failedColumn = columns.find((c) => normalizeColumnKey(c.name) === 'failed');
  const inboxColumnDesktop = columns.find((c) => normalizeColumnKey(c.name) === 'inbox');

  let baseColumns = [];
  if (showFailedOnly) {
    baseColumns = failedColumn ? [failedColumn] : [];
  } else if (boardFilter === 'inbox') {
    baseColumns = inboxColumnDesktop ? [inboxColumnDesktop] : [];
  } else {
    baseColumns = columns.filter((c) => !['inbox', 'failed'].includes(normalizeColumnKey(c.name)));
  }

  const visibleColumns = [...baseColumns];

  visibleColumns.forEach((col) => {
    const column = document.createElement('section');
    column.className = 'column';
    column.dataset.column = normalizeColumnKey(col.name);

    const cards = document.createElement('div');
    cards.className = 'cards';

    const columnKey = normalizeColumnKey(col.name);
    const normalized = (col.items || []).map(normalizeCard).sort((a, b) => priorityScore(b) - priorityScore(a));
    if (!normalized.length) column.classList.add('is-empty');
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
        const risk = Number(draggedCard.dataset.riskLevel || 0);
        const approved = draggedCard.dataset.approved === '1';
        const monarcaOk = draggedCard.dataset.monarcaOk === '1';

        if (!hasExecutionProof(cardData)) {
          showToast('Done bloqueado: falta PROOF (execution.status=effective + evidence).');
          return;
        }
        if (risk >= 1 && !approved) {
          showToast('Done bloqueado: Risco 1 exige aprovação do Jarvis.');
          return;
        }
        if (risk >= 2 && !monarcaOk) {
          showToast('Done bloqueado: Risco 2 exige OK do Monarca.');
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
      const exec = await runMissionReal(first);
      if (!exec.ok) {
        const status = exec.status || 'failed';
        const needsUserAction = exec.needsUserAction || 'Defina melhor o escopo e critério de sucesso.';
        addLiveEvent('Execução real falhou', `${first.title} não teve efetividade real (${(exec.evidence || []).join(', ')}).`, true, { missionKey: first.cardId || makeCardId(first.title), missionTitle: first.title });
        inProgress.items.shift();
        const target = status === 'proof_pending'
          ? ensureColumn('proof_pending', 'Proof Pending')
          : ensureColumn('failed', 'Failed');

        const failStatus = status === 'needs_clarification' ? 'failed' : status;
        const failEvidence = Array.isArray(exec.evidence)
          ? exec.evidence
          : (Array.isArray(first.execution?.evidence) ? first.execution.evidence : []);

        target.items.unshift({
          ...first,
          kind: exec.kind || first.kind,
          effective: false,
          needsEffectiveness: true,
          needsClarification: false,
          owner: 'Alfred',
          executionStatus: failStatus,
          needsUserAction,
          clarificationAsked: false,
          effectEvidence: failEvidence,
          execution: {
            ...(first.execution || {}),
            status: failStatus,
            updatedAt: Date.now(),
            endedAt: Date.now(),
            evidence: failEvidence,
          },
        });

        renderBoard(boardState);
        const persisted = await persistBoardState('effectiveness_reopen', { missionId: first.id || first.cardId, title: first.title, owner: 'Alfred' });
        if (STRICT_PERSISTENCE && !persisted) restoreBoard(before);
        return;
      }

      const execEvidence = Array.isArray(exec.evidence)
        ? exec.evidence
        : (Array.isArray(exec.execution?.evidence) ? exec.execution.evidence : []);

      inProgress.items[0] = {
        ...first,
        kind: exec.kind || first.kind,
        effective: Boolean(exec.ok),
        needsEffectiveness: !Boolean(exec.ok),
        executionStatus: exec.status || exec.execution?.status || 'effective',
        needsUserAction: exec.needsUserAction || '',
        effectEvidence: execEvidence,
        execution: {
          ...(first.execution || {}),
          ...(exec.execution || {}),
          status: exec.status || exec.execution?.status || 'effective',
          evidence: execEvidence,
          updatedAt: Date.now(),
        },
      };
      renderBoard(boardState);
      await persistBoardState('effectiveness_ok', { missionId: first.id || first.cardId, title: first.title });
      const dashboardSynced = await loadDashboard();
      renderBoard(dashboardSynced.columns || fallbackData.columns);
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
    // Avoid refreshing while dragging on desktop.
    if (draggedCard) return;

    const dashboard = await loadDashboard();
    ingestDashboardTransitions(dashboard);
    renderBoard(dashboard.columns || fallbackData.columns);

    const [agents] = await Promise.all([loadAgentsDetails(), loadTelemetry()]);
    if (agents.length) renderAgents(agents);
    if (chatDrawer?.classList.contains('open')) await refreshAgentChat();
  }, refreshMs);
}

function setupUI() {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile && !localStorage.getItem('mc_board_filter')) {
    boardFilter = 'active';
    localStorage.setItem('mc_board_filter', 'active');
  }

  workspace.classList.add('live-collapsed');
  toggleLive.addEventListener('click', () => {
    const isCollapsed = livePanel.classList.toggle('collapsed');
    workspace.classList.toggle('live-collapsed', isCollapsed);
    toggleLive.setAttribute('aria-label', isCollapsed ? 'Abrir Live' : 'Fechar Live');
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

  boardFilterButtons.forEach((btn) => {
    const base = (btn.textContent || '').trim().toLowerCase();
    btn.dataset.filter = base;
  });

  boardFilterBar?.addEventListener('click', (e) => {
    const btn = e.target.closest('.board-filters .chip');
    if (!btn) return;
    const raw = String(btn.dataset.filter || btn.textContent || '').trim().toLowerCase();
    const label = raw.split('(')[0].trim();

    showFailedOnly = false;
    boardFilter = label === 'waiting' ? 'failed' : label;
    localStorage.setItem('mc_board_filter', boardFilter);
    showToast(`Filtro: ${boardFilter}`);
    renderBoard(boardState);
  });

  failedBell?.addEventListener('click', () => {
    showFailedOnly = !showFailedOnly;
    showToast(showFailedOnly ? 'Exibindo apenas falhas (🔔).' : 'Voltando ao board.');
    renderBoard(boardState);
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
    setChatTab('commands');
    renderCmdFeed(['Pronto. Crie uma missão delegada aqui.']);

    // Load default agent cfg
    const id = (agentCfgId?.value || 'stark').trim();
    const cfg = loadAgentCfg(id);
    if (agentCfgEnabled) agentCfgEnabled.checked = cfg.enabled;
    if (agentCfgNotes) agentCfgNotes.value = cfg.notes;
  });
  closeChatBtn?.addEventListener('click', () => chatDrawer?.classList.remove('open'));

  agentCfgTabs.forEach((btn) => btn.addEventListener('click', () => setChatTab(btn.dataset.tab)));

  sendCmdBtn?.addEventListener('click', async () => {
    const to = (cmdToInput?.value || 'stark').trim();
    const cmd = (cmdTextInput?.value || '').trim();
    const riskLevel = Number(cmdRiskInput?.value || 0);
    const success = (cmdSuccessInput?.value || '').trim() || 'Entrega registrada no Live + evidências anexadas.';

    if (!cmd) {
      showToast('Escreva o comando.');
      return;
    }

    const res = await apiPost('/api/agents/command', { to, cmd, riskLevel, successCriteria: success });
    if (!res.ok) {
      showToast((res.data && res.data.message) ? res.data.message : 'Falha ao criar missão de comando');
      return;
    }

    renderCmdFeed([
      `Missão criada: ${res.data?.missionId || 'ok'}`,
      `Para: ${to} | Risco: ${riskLevel}`,
    ]);

    cmdTextInput.value = '';
    if (cmdSuccessInput) cmdSuccessInput.value = '';

    // Refresh board so it appears immediately
    const dashboard = await loadDashboard();
    ingestDashboardTransitions(dashboard);
    renderBoard(dashboard.columns || fallbackData.columns);
  });

  agentCfgId?.addEventListener('change', () => {
    const id = (agentCfgId.value || 'stark').trim();
    const cfg = loadAgentCfg(id);
    if (agentCfgEnabled) agentCfgEnabled.checked = cfg.enabled;
    if (agentCfgNotes) agentCfgNotes.value = cfg.notes;
  });

  saveAgentCfgBtn?.addEventListener('click', async () => {
    const id = (agentCfgId?.value || 'stark').trim();
    const cfg = {
      enabled: Boolean(agentCfgEnabled?.checked),
      notes: String(agentCfgNotes?.value || ''),
      updatedAt: Date.now(),
    };
    saveAgentCfg(id, cfg);
    showToast('Salvo (local).');
  });
  closeBroadcastBtn?.addEventListener('click', () => broadcastDrawer.classList.remove('open'));

  sendBroadcastBtn?.addEventListener('click', async () => {
    const requestedTitle = missionTitleInput.value.trim();
    const desc = missionDescInput.value.trim();
    const missionType = (missionTypeInput?.value || 'Feature').trim() || 'Feature';
    const riskLevel = Number(missionRiskInput?.value || 0);
    const successCriteria = (missionSuccessInput?.value || '').trim();
    const proofExpected = (missionProofInput?.value || '').trim();

    if (!desc) {
      notify('Preencha a descrição (contexto) da missão.');
      return;
    }
    if (!successCriteria) {
      notify('Preencha os critérios de sucesso.');
      return;
    }

    const priority = (missionPriorityInput?.value || 'p2').trim();
    const weights = priority === 'p1'
      ? { impactRevenue: 5, impactAutonomy: 5, urgency: 5 }
      : priority === 'p3'
        ? { impactRevenue: 2, impactAutonomy: 2, urgency: 2 }
        : { impactRevenue: 3, impactAutonomy: 3, urgency: 3 };

    const missionId = makeMissionId();
    const contractBlock = `\n\n---\n[CONTRATO]\nTIPO: ${missionType}\nRISCO: ${riskLevel}\nCRITERIOS_DE_SUCESSO:\n${successCriteria}\n${proofExpected ? `\nPROOF_ESPERADO: ${proofExpected}` : ''}\n---\n`;

    const card = {
      id: missionId,
      missionId,
      cardId: missionId,
      title: requestedTitle || missionId,
      requestedTitle,
      desc: desc + contractBlock,
      priority,
      owner: 'Stark',
      eta: missionEtaInput.value.trim() || 'agora',
      ...weights,

      missionType,
      riskLevel,
      successCriteria,
      proofExpected,
      monarcaOk: false,

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

    card.id = created.missionId || card.id;
    card.missionId = card.id;
    card.cardId = card.id;
    card.title = created.missionTitle || card.title;

    addMissionToInbox(card);
    const boardOk = await persistBoardState('broadcast_inbox', { title: card.title, missionId: card.id || card.cardId });
    if (STRICT_PERSISTENCE && !boardOk) {
      showToast('Falha ao persistir estado do board no backend');
      return;
    }
    addLiveEvent('Broadcast recebeu missão', `${card.title} entrou no Inbox para execução.`, true, { missionKey: card.cardId || makeCardId(card.title), missionTitle: card.title });

    missionTitleInput.value = '';
    missionDescInput.value = '';
    if (missionSuccessInput) missionSuccessInput.value = '';
    if (missionProofInput) missionProofInput.value = '';
    if (missionSuccessInput) missionSuccessInput.value = '';
    if (missionProofInput) missionProofInput.value = '';
    if (missionTypeInput) missionTypeInput.value = 'Feature';
    if (missionRiskInput) missionRiskInput.value = '0';
    try {
      const adv = document.getElementById('broadcast-advanced');
      if (adv) adv.open = false;
    } catch (_) {}
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
