'use client'

import { motion } from 'framer-motion'
import { ArrowLeft, Edit3, Save, X, FileText, Code, Brain, History } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { Agent } from '@/types'
import { useState } from 'react'
import Link from 'next/link'

interface AgentDetailProps {
  agent: Agent
  onClose: () => void
  onSave: (fileName: string, content: string) => void
}

export function AgentDetail({ agent, onClose, onSave }: AgentDetailProps) {
  const [activeTab, setActiveTab] = useState<'SOUL' | 'AGENTS' | 'MEMORY' | 'models'>('SOUL')
  const [content, setContent] = useState(agent.files.SOUL || '')
  const [isSaving, setIsSaving] = useState(false)

  const tabs = [
    { key: 'SOUL', label: 'SOUL', icon: Brain, content: agent.files.SOUL },
    { key: 'AGENTS', label: 'AGENTS', icon: FileText, content: agent.files.AGENTS },
    { key: 'MEMORY', label: 'MEMORY', icon: History, content: agent.files.MEMORY },
    { key: 'models', label: 'models.json', icon: Code, content: agent.files.models },
  ]

  const handleSave = async () => {
    setIsSaving(true)
    await onSave(activeTab, content)
    setIsSaving(false)
  }

  const currentTab = tabs.find(t => t.key === activeTab)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-900"
    >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-800/80 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" onClick={onClose}>
                <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                  <ArrowLeft className="text-gray-400" />
                </button>
              </Link>
              <span className="text-4xl">{agent.emoji}</span>
              <div>
                <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
                <p className="text-gray-400 text-sm">{agent.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                agent.status === 'active' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-gray-500/20 text-gray-400'
              }`}>
                {agent.status === 'active' ? '🟢 Active' : '⚪ Disabled'}
              </span>
              
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-stark-600 hover:bg-stark-500 
                         disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
              >
                <Save size={18} />
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          {/* Agent Info */}
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Tier:</span>
              <span className={`px-2 py-0.5 rounded ${
                agent.tier === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                agent.tier === 2 ? 'bg-stark-500/20 text-stark-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {agent.tier}
              </span>
            </div>
            {agent.provider && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Provider:</span>
                <span className="text-white">{agent.provider}</span>
              </div>
            )}
            {agent.model && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Model:</span>
                <span className="text-stark-400">{agent.model}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-6">
          {/* File Tabs */}
          <div className="w-64 space-y-2">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key as any)
                  setContent(tab.content || '')
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeTab === tab.key
                    ? 'bg-stark-600/20 text-stark-400 border border-stark-500/30'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                <tab.icon size={18} />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1">
            <div className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700">
              <Editor
                height="calc(100vh - 280px)"
                language={activeTab === 'models' ? 'json' : 'markdown'}
                theme="vs-dark"
                value={content}
                onChange={value => setContent(value || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  padding: { top: 20, bottom: 20 },
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </motion.div>
  )
}
