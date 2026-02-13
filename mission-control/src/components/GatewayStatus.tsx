'use client'

import { motion } from 'framer-motion'
import { GatewayStatus } from '@/types'
import { formatBytes, formatUptime } from '@/lib/utils'
import { Server, Clock, Calendar, Users, Zap, RefreshCw } from 'lucide-react'

interface GatewayStatusProps {
  status: GatewayStatus
}

export function GatewayStatusCard({ status }: GatewayStatusProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 rounded-2xl p-6 border border-gray-700/50"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Zap className="text-yellow-400" /> Gateway Status
        </h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${status.running ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {status.running ? '🟢 Online' : '🔴 Offline'}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusItem
          icon={Clock}
          label="Uptime"
          value={status.uptime}
          color="blue"
        />
        <StatusItem
          icon={Server}
          label="Memory"
          value={formatBytes(status.memory)}
          color="purple"
        />
        <StatusItem
          icon={Calendar}
          label="Cron Jobs"
          value={status.cronJobs.toString()}
          color="green"
        />
        <StatusItem
          icon={Users}
          label="Sessions"
          value={status.activeSessions.toString()}
          color="orange"
        />
      </div>

      <button className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 
                       rounded-lg text-sm text-gray-400 transition-colors">
        <RefreshCw size={14} /> Restart Gateway
      </button>
    </motion.div>
  )
}

interface StatusItemProps {
  icon: any
  label: string
  value: string
  color: 'blue' | 'purple' | 'green' | 'orange'
}

function StatusItem({ icon: Icon, label, value, color }: StatusItemProps) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    green: 'text-green-400 bg-green-500/10',
    orange: 'text-orange-400 bg-orange-500/10'
  }

  return (
    <div className={`${colors[color]} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} />
        <span className="text-xs opacity-70">{label}</span>
      </div>
      <span className="text-lg font-bold">{value}</span>
    </div>
  )
}
