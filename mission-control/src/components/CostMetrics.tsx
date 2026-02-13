'use client'

import { motion } from 'framer-motion'
import { CostMetrics } from '@/types'
import { DollarSign, TrendingUp, Activity, Users } from 'lucide-react'

interface CostMetricsProps {
  metrics: CostMetrics
}

export function CostMetricsCard({ metrics }: CostMetricsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-gradient-to-br from-green-900/50 to-emerald-900/50 rounded-2xl p-6 border border-green-700/30"
    >
      <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
        <DollarSign className="text-green-400" /> Costs Overview
      </h3>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-green-500/10 rounded-xl p-4">
          <span className="text-green-400 text-sm">Total Input</span>
          <div className="text-2xl font-bold text-white">${metrics.totalInput.toFixed(2)}</div>
        </div>
        <div className="bg-emerald-500/10 rounded-xl p-4">
          <span className="text-emerald-400 text-sm">Total Output</span>
          <div className="text-2xl font-bold text-white">${metrics.totalOutput.toFixed(2)}</div>
        </div>
      </div>

      {/* By Agent */}
      <div className="space-y-3">
        <h4 className="text-sm text-gray-400 font-medium">By Agent</h4>
        {Object.entries(metrics.byAgent).slice(0, 5).map(([agent, costs]) => (
          <div key={agent} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/30">
            <span className="text-white text-sm capitalize">{agent}</span>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-400">in: ${costs.input.toFixed(2)}</span>
              <span className="text-gray-400">out: ${costs.output.toFixed(2)}</span>
              <span className="text-green-400 font-medium">
                ${(costs.input + costs.output).toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
