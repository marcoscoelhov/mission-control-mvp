const agents = [
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
];

const columns = [
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
];

const feed = [
  ['@Vision completed SERP Feature Audit', 'Rich snippet opportunities mapped and tagged.'],
  ['SERP Feature Audit moved to done', 'All high-priority pages exported to board.'],
  ['@Fury comentou em Customer Interview', 'Ajustar roteiro para churned segment.'],
  ['@Hawkeye iniciou Listicle Outreach', '5 novos domínios adicionados ao plano.'],
  ['@Shuri pediu revisão de pricing brief', 'Comparativo com 8 concorrentes.'],
];

const agentsList = document.getElementById('agents-list');
const kanban = document.getElementById('kanban');
const liveFeed = document.getElementById('live-feed');

agents.forEach(([icon, name, role]) => {
  const item = document.createElement('article');
  item.className = 'agent-item';
  item.innerHTML = `
    <div class="agent-icon">${icon}</div>
    <div class="agent-main">
      <strong>${name}</strong>
      <span>${role}</span>
    </div>
    <div class="status">Working</div>
  `;
  agentsList.appendChild(item);
});

columns.forEach((col) => {
  const column = document.createElement('section');
  column.className = 'column';

  const cards = col.items
    .map(
      ([title, desc, owner, eta]) => `
      <article class="card">
        <h3>${title}</h3>
        <p>${desc}</p>
        <div class="card-foot">
          <span>${owner}</span>
          <span>${eta} ago</span>
        </div>
      </article>
    `,
    )
    .join('');

  column.innerHTML = `
    <header class="column-head">
      <span>${col.name}</span>
      <span>${col.items.length}</span>
    </header>
    <div class="cards">${cards}</div>
  `;

  kanban.appendChild(column);
});

feed.forEach(([title, message]) => {
  const item = document.createElement('article');
  item.className = 'feed-item';
  item.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
  liveFeed.appendChild(item);
});
