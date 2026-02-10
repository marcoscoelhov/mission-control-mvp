const fallbackData = {
  agents: [
    ['🛠️', 'Friday', 'Developer Agent'],
    ['📈', 'Fury', 'Customer Research'],
    ['🌱', 'Groot', 'Retention Specialist'],
    ['🏹', 'Hawkeye', 'Outbound Scout'],
    ['🧠', 'Jarvis', 'Squad Lead'],
    ['✍️', 'Loki', 'Content Writer'],
    ['📮', 'Pepper', 'Email Marketing'],
    ['📱', 'Quill', 'Social Media'],
    ['🔍', 'Rob', 'Strategic Advisor'],
    ['📊', 'Shuri', 'Product Analyst'],
    ['👁️', 'Vision', 'SERP Monitor'],
  ],
  columns: [
    {
      name: 'Inbox',
      items: [
        ['E-commerce Vertical Implementation Guide', 'Comprehensive docs for 11 core verticals.', 'Friday', '4m'],
        ['Social Content Case Launch Threads', 'Create X threads to promote new case.', 'Quill', '1d'],
      ],
    },
    {
      name: 'Assigned',
      items: [
        ['Execute Real Estate Distribution', 'Run distribution protocol for geo-specific blogs.', 'Groot', '40m'],
        ['Outbound Distribution - Week 2', 'Expand channels beyond Week 1 basics.', 'Hawkeye', '1d'],
      ],
    },
    {
      name: 'In Progress',
      items: [
        ['Listicle Outreach Campaign - 5 Targets', 'Execute outreach to high-priority AI chatbot sites.', 'Hawkeye', '2d'],
        ['Zendesk Marketplace Integration', 'Ship integration docs and release notes.', 'Jarvis', '1d'],
        ['Indie Hackers Database', 'Map competitor backlinks for opportunity list.', 'Vision', '2h'],
      ],
    },
    {
      name: 'Review',
      items: [
        ['SiteGPT Hero Video Production', 'Produce 30-45 second hero clip.', 'Wanda', '3d'],
        ['Competitor Pricing Research', 'Complete pricing matrix and summary.', 'Fury', '6h'],
      ],
    },
    {
      name: 'Done',
      items: [
        ['Shopify Blog Landing Page', 'Landing page copy and metadata finalized.', 'Loki', '2d'],
        ['Product Demo Video Script', 'Script completed and approved.', 'Shuri', '2d'],
        ['Tweet Content - Real Stories', 'Batch of social posts scheduled.', 'Quill', '20m'],
      ],
    },
  ],
  feed: [
    ['@Vision completed SERP Feature Audit', 'Rich snippet opportunities mapped and tagged.'],
    ['SERP Feature Audit moved to done', 'All high-priority pages exported to board.'],
    ['@Fury comentou em Customer Interview', 'Ajustar roteiro para churned segment.'],
    ['@Hawkeye iniciou Listicle Outreach', '5 novos domínios adicionados ao plano.'],
    ['@Shuri pediu revisão de pricing brief', 'Comparativo com 8 concorrentes.'],
  ],
};

const agentsList = document.getElementById('agents-list');
const kanban = document.getElementById('kanban');
const liveFeed = document.getElementById('live-feed');
const livePanel = document.getElementById('live-panel');
const toggleLive = document.getElementById('toggle-live');
const workspace = document.querySelector('.workspace');

let draggedCard = null;

const normalizeData = (raw) => ({
  agents: Array.isArray(raw?.agents) ? raw.agents : fallbackData.agents,
  columns: Array.isArray(raw?.columns) ? raw.columns : fallbackData.columns,
  feed: Array.isArray(raw?.feed) ? raw.feed : fallbackData.feed,
});

const normalizeColumnKey = (name = '') =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');

const makeCardId = (title = '') =>
  `card_${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')}`;

function normalizeAgent(agent) {
  if (Array.isArray(agent)) {
    const [icon, name, role] = agent;
    return { icon, name, role, status: 'working' };
  }

  return {
    icon: agent?.icon || '🤖',
    name: agent?.name || 'Agent',
    role: agent?.role || 'OpenClaw Agent',
    status: agent?.status || 'online',
  };
}

async function loadData() {
  const endpoints = ['/api/dashboard', './data.json'];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = await res.json();
      return normalizeData(json);
    } catch (_) {}
  }

  return fallbackData;
}

async function loadOpenClawAgents() {
  const endpoints = ['/api/openclaw/agents', './openclaw-agents.json'];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json?.agents) && json.agents.length > 0) {
        return json.agents.map(normalizeAgent);
      }
    } catch (_) {}
  }

  return null;
}

async function persistMove(payload) {
  const endpoints = ['/api/dashboard/move', '/api/cards/move', '/api/card/move'];

  for (const url of endpoints) {
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

function createCard([title, desc, owner, eta]) {
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;

  const cardId = makeCardId(title);
  card.dataset.cardId = cardId;
  card.dataset.title = title;

  card.innerHTML = `
    <h3>${title}</h3>
    <p>${desc}</p>
    <div class="card-foot">
      <span>${owner}</span>
      <span>${eta} ago</span>
    </div>
  `;

  card.addEventListener('dragstart', () => {
    draggedCard = card;
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCard = null;
    document.querySelectorAll('.cards.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });

  return card;
}

function renderAgents(agents) {
  agentsList.innerHTML = '';
  agents.map(normalizeAgent).forEach(({ icon, name, role, status }) => {
    const item = document.createElement('article');
    item.className = 'agent-item';
    item.innerHTML = `
      <div class="agent-icon">${icon}</div>
      <div class="agent-main">
        <strong>${name}</strong>
        <span>${role}</span>
      </div>
      <div class="status">${status}</div>
    `;
    agentsList.appendChild(item);
  });
}

function renderBoard(columns) {
  kanban.innerHTML = '';

  columns.forEach((col) => {
    const column = document.createElement('section');
    column.className = 'column';

    const columnKey = normalizeColumnKey(col.name);
    column.dataset.column = columnKey;

    const cards = document.createElement('div');
    cards.className = 'cards';

    cards.addEventListener('dragover', (e) => {
      e.preventDefault();
      cards.classList.add('drag-over');
    });

    cards.addEventListener('dragleave', () => cards.classList.remove('drag-over'));

    cards.addEventListener('drop', async (e) => {
      e.preventDefault();
      cards.classList.remove('drag-over');
      if (!draggedCard) return;

      const fromColumnEl = draggedCard.closest('.column');
      const fromColumn = fromColumnEl?.dataset.column || null;
      const toColumn = column.dataset.column;

      const siblings = [...cards.querySelectorAll('.card:not(.dragging)')];
      const next = siblings.find((s) => e.clientY <= s.getBoundingClientRect().top + s.offsetHeight / 2);
      if (next) cards.insertBefore(draggedCard, next);
      else cards.appendChild(draggedCard);

      const toIndex = [...cards.querySelectorAll('.card')].indexOf(draggedCard);
      updateAllCounts();

      const ok = await persistMove({
        cardId: draggedCard.dataset.cardId,
        title: draggedCard.dataset.title,
        fromColumn,
        toColumn,
        toIndex,
      });

      if (!ok) console.warn('Não foi possível persistir movimento no backend (UI local mantida).');
    });

    col.items.forEach((item) => cards.appendChild(createCard(item)));

    column.innerHTML = `
      <header class="column-head">
        <span>${col.name}</span>
        <span>${col.items.length}</span>
      </header>
    `;

    column.appendChild(cards);
    kanban.appendChild(column);
  });
}

function renderFeed(feed) {
  liveFeed.innerHTML = '';
  feed.forEach(([title, message]) => {
    const item = document.createElement('article');
    item.className = 'feed-item';
    item.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
    liveFeed.appendChild(item);
  });
}

function updateAllCounts() {
  document.querySelectorAll('.column').forEach((column) => {
    const total = column.querySelectorAll('.card').length;
    const countEl = column.querySelector('.column-head span:last-child');
    if (countEl) countEl.textContent = String(total);
  });
}

function setupUI() {
  workspace.classList.add('live-collapsed');

  toggleLive.addEventListener('click', () => {
    const isCollapsed = livePanel.classList.toggle('collapsed');
    workspace.classList.toggle('live-collapsed', isCollapsed);
    toggleLive.setAttribute('aria-label', isCollapsed ? 'Expandir Live' : 'Colapsar Live');
  });
}

async function init() {
  setupUI();
  const data = await loadData();
  const openclawAgents = await loadOpenClawAgents();

  renderAgents(openclawAgents || data.agents);
  renderBoard(data.columns);
  renderFeed(data.feed);
}

init();
