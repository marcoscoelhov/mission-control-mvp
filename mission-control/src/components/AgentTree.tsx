'use client'

import { motion } from 'framer-motion'
import { Agent } from '@/types'
import { cn } from '@/lib/utils'

interface AgentTreeProps {
  agents: Agent[]
  selectedAgent: Agent | null
  onSelectAgent: (agent: Agent) => void
}

export function AgentTree({ agents, selectedAgent, onSelectAgent }: AgentTreeProps) {
  const tier1 = agents.filter(a => a.tier === 1)
  const tier2 = agents.filter(a => a.tier === 2)
  const tier3 = agents.filter(a => a.tier === 3)

  return (
    <div className="p-6 bg-gradient-to-b from-gray-900/50 to-gray-800/50 rounded-2xl border border-gray-700/50">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <span>🏰</span> Hierarchy
      </h2>

      {/* TIER 1 - Command */}
      <div className="mb-8">
        <h3 className="text-yellow-400 text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="w-1 h-1 bg-yellow-400 rounded-full" /> COMMAND
        </h3>
        <div className="flex flex-wrap gap-3">
          {tier1.map(agent => (
            <TreeNode
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent?.id === agent.id}
              onSelect={() => onSelectAgent(agent)}
              color="yellow"
            />
          ))}
        </div>
      </div>

      {/* TIER 2 - Officers */}
      <div className="mb-8">
        <h3 className="text-stark-400 text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="w-1 h-1 bg-stark-400 rounded-full" /> OFFICERS
        </h3>
        <div className="flex flex-wrap gap-3">
          {tier2.map(agent => (
            <TreeNode
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent?.id === agent.id}
              onSelect={() => onSelectAgent(agent)}
              color="blue"
            />
          ))}
        </div>
      </div>

      {/* TIER 3 - Specialists */}
      <div>
        <h3 className="text-gray-400 text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="w-1 h-1 bg-gray-400 rounded-full" /> SPECIALISTS
        </h3>
        <div className="flex flex-wrap gap-3">
          {tier3.map(agent => (
            <TreeNode
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent?.id === agent.id}
              onSelect={() => onSelectAgent(agent)}
              color="gray"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface TreeNodeProps {
  agent: Agent
  isSelected: boolean
  onSelect: () => void
  color: 'yellow' | 'blue' | 'gray'
}

function TreeNode({ agent, isSelected, onSelect, color }: TreeNodeProps) {
  const colorClasses = {
    yellow: 'hover:border-yellow-500/50 hover:bg-yellow-500/10',
    blue: 'hover:border-stark-500/50 hover:bg-stark-500/10',
    gray: 'hover:border-gray-500/50 hover:bg-gray-500/10'
  }

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700/50 bg-gray-800/30',
        'transition-all duration-200',
        colorClasses[color],
        isSelected && 'ring-2 ring-stark-400 border-stark-400 bg-stark-500/20'
      )}
    >
      <span className="text-lg">{agent.emoji}</span>
      <span className="text-sm font-medium text-white">{agent.name}</span>
      {agent.status === 'active' && (
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full ml-1" />
      )}
    </motion.button>
  )
}
