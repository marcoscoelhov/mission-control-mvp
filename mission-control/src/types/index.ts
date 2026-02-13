export interface Agent {
  id: string
  name: string
  emoji: string
  role: string
  tier: 1 | 2 | 3
  status: 'active' | 'disabled' | 'error'
  provider?: string
  model?: string
  files: AgentFiles
  hierarchy: AgentHierarchy
}

export interface AgentFiles {
  SOUL?: string
  AGENTS?: string
  MEMORY?: string
  models?: string
  auth?: string
}

export interface AgentHierarchy {
  parent?: string
  children?: string[]
  reportsTo?: string[]
}

export interface Squad {
  tier1: Agent[]
  tier2: Agent[]
  tier3: Agent[]
  disabled: Agent[]
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  models: Model[]
  hasApiKey: boolean
}

export interface Model {
  id: string
  name: string
  reasoning: boolean
  cost: {
    input: number
    output: number
  }
  contextWindow: number
}

export interface GatewayStatus {
  running: boolean
  uptime: string
  memory: number
  cronJobs: number
  activeSessions: number
}

export interface CostMetrics {
  totalInput: number
  totalOutput: number
  byAgent: Record<string, { input: number; output: number }>
  byProvider: Record<string, { input: number; output: number }>
}
