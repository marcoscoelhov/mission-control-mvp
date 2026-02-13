'use client'

import { motion } from 'framer-motion'
import { Agent } from '@/types'
import { cn } from '@/lib/utils'

interface AgentCardProps {
  agent: Agent
  onClick: () => void
  isSelected: boolean
}

export function AgentCard({ agent, onClick, isSelected }: AgentCardProps) {
  const tierColors = {
    1: 'from-yellow-500/20 to-amber-600/20 border-yellow-500/50',
    2: 'from-stark-500/20 to-stark-600/20 border-stark-500/50',
    3: 'from-gray-500/20 to-gray-600/20 border-gray-500/50'
  }
  
  const tierBadges = {
    1: '👑 T1',
    2: '⭐ T2',
    3: '🔹 T3'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300',
        'hover:shadow-lg hover:shadow-stark-500/10',
        tierColors[agent.tier],
        isSelected && 'ring-2 ring-stark-400 ring-offset-2 ring-offset-gray-900',
        agent.status === 'disabled' && 'opacity-50 grayscale'
      )}
    >
      {/* Status indicator */}
      <div className={cn(
        'absolute top-2 right-2 w-2 h-2 rounded-full',
        agent.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
      )} />
      
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{agent.emoji}</span>
        <div>
          <h3 className="font-bold text-white text-lg">{agent.name}</h3>
          <span className="text-xs text-gray-400">{tierBadges[agent.tier]}</span>
        </div>
      </div>
      
      {/* Role */}
      <p className="text-gray-300 text-sm mb-2 line-clamp-2">{agent.role}</p>
      
      {/* Provider/Model */}
      {agent.provider && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-2 py-0.5 bg-gray-800 rounded">{agent.provider}</span>
          {agent.model && (
            <>
              <span>/</span>
              <span className="text-stark-400">{agent.model}</span>
            </>
          )}
        </div>
      )}
      
      {/* Files indicator */}
      <div className="flex gap-1 mt-3">
        {Object.entries(agent.files).filter(([_, v]) => v).map(([key]) => (
          <span key={key} className="text-xs px-1.5 py-0.5 bg-gray-800/50 rounded text-gray-400">
            {key.replace('.md', '')}
          </span>
        ))}
      </div>
    </motion.div>
  )
}
