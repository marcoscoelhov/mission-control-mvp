import { create } from 'zustand'
import { Agent, GatewayStatus, CostMetrics } from '@/types'

interface MissionControlState {
  agents: Agent[]
  selectedAgent: Agent | null
  gatewayStatus: GatewayStatus | null
  costMetrics: CostMetrics | null
  isLoading: boolean
  error: string | null
  
  // Actions
  setAgents: (agents: Agent[]) => void
  selectAgent: (agent: Agent | null) => void
  updateAgentFile: (agentId: string, fileName: string, content: string) => void
  setGatewayStatus: (status: GatewayStatus) => void
  setCostMetrics: (metrics: CostMetrics) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useMissionControlStore = create<MissionControlState>((set) => ({
  agents: [],
  selectedAgent: null,
  gatewayStatus: null,
  costMetrics: null,
  isLoading: false,
  error: null,

  setAgents: (agents) => set({ agents }),
  selectAgent: (agent) => set({ selectedAgent: agent }),
  updateAgentFile: (agentId, fileName, content) => set((state) => ({
    agents: state.agents.map(a => 
      a.id === agentId 
        ? { ...a, files: { ...a.files, [fileName]: content } }
        : a
    )
  })),
  setGatewayStatus: (status) => set({ gatewayStatus: status }),
  setCostMetrics: (metrics) => set({ costMetrics: metrics }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))
