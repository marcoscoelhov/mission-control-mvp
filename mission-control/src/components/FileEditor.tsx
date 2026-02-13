'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Editor from '@monaco-editor/react'
import { Agent } from '@/types'
import { Save, X, FileText, Code, Brain, Key } from 'lucide-react'

interface FileEditorProps {
  agent: Agent
  onClose: () => void
  onSave: (fileName: string, content: string) => void
}

export function FileEditor({ agent, onClose, onSave }: FileEditorProps) {
  const [activeFile, setActiveFile] = useState<string>('SOUL')
  const [content, setContent] = useState(agent.files.SOUL || '')
  const [isSaving, setIsSaving] = useState(false)

  const files = [
    { key: 'SOUL', label: 'SOUL', icon: Brain, content: agent.files.SOUL },
    { key: 'AGENTS', label: 'AGENTS', icon: FileText, content: agent.files.AGENTS },
    { key: 'MEMORY', label: 'MEMORY', icon: FileText, content: agent.files.MEMORY },
    { key: 'models', label: 'models.json', icon: Code, content: agent.files.models },
  ]

  const handleSave = async () => {
    setIsSaving(true)
    await onSave(activeFile, content)
    setIsSaving(false)
  }

  const currentFile = files.find(f => f.key === activeFile)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gray-900 rounded-2xl w-full max-w-6xl h-[85vh] overflow-hidden border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-4">
            <span className="text-2xl">{agent.emoji}</span>
            <div>
              <h2 className="text-xl font-bold text-white">{agent.name}</h2>
              <p className="text-sm text-gray-400">File Editor</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-stark-600 hover:bg-stark-500 
                       disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
            >
              <Save size={18} />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex h-[calc(100%-80px)]">
          {/* File tabs */}
          <div className="w-48 border-r border-gray-700 p-3 space-y-1 bg-gray-800/30">
            {files.map(file => (
              <button
                key={file.key}
                onClick={() => {
                  setActiveFile(file.key)
                  setContent(file.content || '')
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeFile === file.key
                    ? 'bg-stark-600/20 text-stark-400 border border-stark-500/30'
                    : 'text-gray-400 hover:bg-gray-700/50'
                }`}
              >
                <file.icon size={16} />
                {file.label}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1">
            <Editor
              height="100%"
              language={activeFile === 'models' ? 'json' : 'markdown'}
              theme="vs-dark"
              value={content}
              onChange={value => setContent(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 16, bottom: 16 },
              }}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
