# 🏰 Mission Control

Agent Management Dashboard para Stark Industries.

## Visão Geral

Dashboard completo para visualizar, gerenciar e editar todos os agentes do OpenClaw sem quebrar o gateway.

### Funcionalidades

- 📊 **Dashboard Central** - Visualização em tempo real de todos os agentes
- 🌳 **Hierarquia Visual** - Arvore de comando com tiers (T1/T2/T3)
- 📝 **Editor de Arquivos** - Edit SOUL.md, AGENTS.md, MEMORY.md e models.json
- 💰 **Métricas de Custo** - Tracking de custos por agente e provedor
- ⚡ **Status do Gateway** - Uptime, memória, cron jobs, sessões ativas
- 🔒 **Edição Segura** - Saves diretos no filesystem sem reiniciar

## Quick Start

```bash
cd mission-control
npm install
npm run dev
```

Acesse: `http://localhost:3000`

## Estrutura

```
mission-control/
├── src/
│   ├── app/
│   │   ├── api/agents/route.ts  # API para ler/salvar arquivos
│   │   ├── page.tsx             # Dashboard principal
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── AgentCard.tsx        # Card de agente
│   │   ├── AgentTree.tsx        # Hierarquia visual
│   │   ├── AgentDetail.tsx      # Página de detalhes
│   │   ├── FileEditor.tsx       # Editor Monaco
│   │   ├── GatewayStatus.tsx    # Status do gateway
│   │   └── CostMetrics.tsx      # Métricas de custo
│   ├── lib/
│   │   ├── agents.ts            # Leitura de agentes
│   │   └── utils.ts             # Utilitários
│   ├── store/
│   │   └── missionControl.ts   # Zustand store
│   └── types/
│       └── index.ts             # Tipos TypeScript
├── tailwind.config.ts
└── package.json
```

## Hierarquia dos Agentes

```
T1 - COMMAND (👑)
├── 🛡️ Stark (General)
├── 🧾 Jarvis (Aprovador)  
└── 🔮 Oráculo (Visionário)

T2 - OFFICERS (⭐)
├── 💻 Thanos (Código)
├── 🎨 Wanda (Design)
├── 🎭 Loki (Criativo)
├── 🐙 Octopus (Intel)
└── ...

T3 - SPECIALISTS (🔹)
└── Batman, Thor, Vision, Lex, Alfred...
```

## Screenshots

### Dashboard Principal
- Cards de agentes com emoji, tier, provider, modelo
- Gateway status em tempo real
- Métricas de custos

### Hierarquia
- Visualização em árvore da estrutura
- Cores por tier
- Status de atividade

### Editor
- Monaco Editor com syntax highlight
- Abas para cada arquivo (SOUL, AGENTS, MEMORY, models.json)
- Salvamento direto no filesystem

## API

### GET /api/agents?agentId=&fileName=
Lê arquivo de um agente.

### POST /api/agents
Salva arquivo de agente.

```json
{
  "agentId": "loki",
  "fileName": "SOUL.md",
  "content": "# SOUL.md content..."
}
```

## Tech Stack

- **Next.js 14** - App Router
- **TypeScript** - Tipagem completa
- **Tailwind CSS** - Styling
- **Framer Motion** - Animações
- **Monaco Editor** - Editor de código
- **Zustand** - State management
- **Gray-matter** - Parse de Markdown

## Integração com OpenClaw

O dashboard lê diretamente dos arquivos em:
- `/root/.openclaw/agents/<agent>/agent/SOUL.md`
- `/root/.openclaw/agents/<agent>/agent/AGENTS.md`
- `/root/.openclaw/agents/<agent>/agent/MEMORY.md`
- `/root/.openclaw/agents/<agent>/agent/models.json`

Esalva de volta sem precisar reiniciar o gateway.

## Configuração

### Provedores Suportados

- Google Antigravity (Claude)
- MiniMax
- Moonshot (Kimi)
- xAI (Grok)
- OpenAI Codex

### Variáveis de Ambiente

O dashboard lê os modelos dos arquivos `models.json` de cada agente automaticamente.

## Lema

> *"Ordem, Eficiência, Lealdade"*

---

🏰 **Stark Industries**
