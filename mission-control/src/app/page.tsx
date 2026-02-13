'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AgentCard } from '@/components/AgentCard'
import { AgentTree } from '@/components/AgentTree'
import { FileEditor } from '@/components/FileEditor'
import { GatewayStatusCard } from '@/components/GatewayStatus'
import { CostMetricsCard } from '@/components/CostMetrics'
import { Agent, GatewayStatus, CostMetrics } from '@/types'
import { Crown, Shield, Zap, Users, Activity, Settings } from 'lucide-react'

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
  const [costMetrics, setCostMetrics] = useState<CostMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/agents')
        const data = await response.json()
        
        if (data.agents) {
          setAgents(data.agents)
          setGatewayStatus(data.gatewayStatus)
          
          // Simulated cost metrics
          setCostMetrics({
            totalInput: 12.50,
            totalOutput: 45.30,
            byAgent: {
              stark: { input: 3.20, output: 12.40 },
              loki: { input: 1.50, output: 8.20 },
              octopus: { input: 4.80, output: 15.60 },
              thanos: { input: 2.00, output: 9.10 }
            },
            byProvider: {
              'google-antigravity': { input: 5.00, output: 20.00 },
              'minimax': { input: 7.50, output: 25.30 }
            }
          })
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  const handleSelectAgent = useCallback((agent: Agent) => {
    setSelectedAgent(agent)
    setShowEditor(true)
  }, [])

  const handleSaveFile = async (fileName: string, content: string) => {
    if (!selectedAgent) return
    
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: selectedAgent.id,
        fileName,
        content
      })
    })
    const data = await response.json()
    
    if (data.success) {
      // Update local state
      setAgents(prev => prev.map(a => 
        a.id === selectedAgent.id 
          ? { ...a, files: { ...a.files, [fileName]: content } }
          : a
      ))
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="text-4xl"
        >
          ⚙️
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <span className="animate-glow">🏰</span> Mission Control
          </h1>
          <p className="text-gray-400 mt-1">Stark Industries • Agent Management</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <Settings className="text-gray-400" />
          </button>
          <div className="px-4 py-2 bg-stark-600/20 border border-stark-500/30 rounded-lg">
            <span className="text-stark-400 text-sm font-medium">
              {agents.filter(a => a.status === 'active').length} Active Agents
            </span>
          </div>
        </div>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {gatewayStatus && <GatewayStatusCard status={gatewayStatus} />}
        {costMetrics && <CostMetricsCard metrics={costMetrics} />}
        
        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 rounded-2xl p-6 border border-purple-700/30"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Users className="text-purple-400" /> Squad Overview
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Agents</span>
              <span className="text-white font-bold">{agents.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tier 1 (Command)</span>
              <span className="text-yellow-400 font-bold">{agents.filter(a => a.tier === 1).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tier 2 (Officers)</span>
              <span className="text-stark-400 font-bold">{agents.filter(a => a.tier === 2).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tier 3 (Specialists)</span>
              <span className="text-gray-400 font-bold">{agents.filter(a => a.tier === 3).length}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Hierarchy */}
        <div className="xl:col-span-1">
          <AgentTree
            agents={agents}
            selectedAgent={selectedAgent}
            onSelectAgent={handleSelectAgent}
          />
        </div>

        {/* Right: Agents Grid */}
        <div className="xl:col-span-2">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="text-yellow-400" /> Agents
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <AgentCard
                  agent={agent}
                  onClick={() => handleSelectAgent(agent)}
                  isSelected={selectedAgent?.id === agent.id}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* File Editor Modal */}
      <AnimatePresence>
        {showEditor && selectedAgent && (
          <FileEditor
            agent={selectedAgent}
            onClose={() => setShowEditor(false)}
            onSave={handleSaveFile}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
