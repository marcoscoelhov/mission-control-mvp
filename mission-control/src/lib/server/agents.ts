import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { Agent, Provider, GatewayStatus } from '@/types'

const OPENCLAW_PATH = '/root/.openclaw/agents'
const WORKSPACE_PATH = '/root/.openclaw/workspace-stark'

export async function loadAgents(): Promise<Agent[]> {
  const agents: Agent[] = []
  
  // Read agents directory
  const entries = fs.readdirSync(OPENCLAW_PATH, { withFileTypes: true })
  
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '_disabled') {
      const agentPath = path.join(OPENCLAW_PATH, entry.name, 'agent')
      
      if (fs.existsSync(agentPath)) {
        const agent = await parseAgent(entry.name, agentPath)
        if (agent) agents.push(agent)
      }
    }
  }
  
  return agents
}

async function parseAgent(name: string, agentPath: string): Promise<Agent | null> {
  const files: Record<string, string> = {}
  let tier: 1 | 2 | 3 = 3
  let role = 'Oficial'
  
  // Read SOUL.md
  const soulPath = path.join(agentPath, 'SOUL.md')
  if (fs.existsSync(soulPath)) {
    const content = fs.readFileSync(soulPath, 'utf-8')
    files.SOUL = content
    
    // Extract info from SOUL
    const titleMatch = content.match(/^# SOUL\.md — (\w+)/m)
    const jobMatch = content.match(/## Job title\s*\n(?:.*?\n)*?\*\*([^*]+)\*\*/m)
    const missionMatch = content.match(/## Missão\s*\n(.+)/m)
    
    if (titleMatch) name = titleMatch[1]
    if (jobMatch) role = jobMatch[1].trim()
    if (missionMatch) role = missionMatch[1].trim().slice(0, 50)
  }
  
  // Read AGENTS.md
  const agentsPath = path.join(agentPath, 'AGENTS.md')
  if (fs.existsSync(agentsPath)) {
    files.AGENTS = fs.readFileSync(agentsPath, 'utf-8')
  }
  
  // Read MEMORY.md
  const memoryPath = path.join(agentPath, 'MEMORY.md')
  if (fs.existsSync(memoryPath)) {
    files.MEMORY = fs.readFileSync(memoryPath, 'utf-8')
  }
  
  // Read models.json
  const modelsPath = path.join(agentPath, 'models.json')
  let provider: string | undefined
  let model: string | undefined
  
  if (fs.existsSync(modelsPath)) {
    files.models = fs.readFileSync(modelsPath, 'utf-8')
    try {
      const modelsData = JSON.parse(files.models)
      provider = Object.keys(modelsData.providers || {})[0]
      model = modelsData.providers?.[provider]?.models?.[0]?.name
    } catch (e) {}
  }
  
  // Determine tier based on name
  const tier1 = ['stark', 'jarvis', 'oracle', 'oraculo']
  const tier2 = ['thanos', 'wanda', 'loki', 'batman', 'thor', 'vision', 'lex', 'alfred', 'octopus']
  
  if (tier1.includes(name.toLowerCase())) tier = 1
  else if (tier2.includes(name.toLowerCase())) tier = 2
  
  // Get emoji based on name
  const emojis: Record<string, string> = {
    stark: '🛡️', jarvis: '🧾', oracle: '🔮', oraculo: '🔮',
    thanos: '💻', wanda: '🎨', loki: '🎭', octopus: '🐙',
    vision: '👁️', lex: '📊', batman: '🦇', thor: '⚡', alfred: '🎩'
  }
  
  return {
    id: name.toLowerCase(),
    name,
    emoji: emojis[name.toLowerCase()] || '🤖',
    role,
    tier,
    status: 'active',
    provider,
    model,
    files: {
      SOUL: files.SOUL,
      AGENTS: files.AGENTS,
      MEMORY: files.MEMORY,
      models: files.models,
    },
    hierarchy: {
      children: [],
      reportsTo: []
    }
  }
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  // Simulated status - would integrate with actual gateway API
  return {
    running: true,
    uptime: '5d 12h 34m',
    memory: 533164,
    cronJobs: 5,
    activeSessions: 3
  }
}

export function saveAgentFile(agentId: string, fileName: string, content: string): boolean {
  const filePath = path.join(OPENCLAW_PATH, agentId, 'agent', fileName)
  
  try {
    fs.writeFileSync(filePath, content)
    return true
  } catch (e) {
    console.error('Failed to save file:', e)
    return false
  }
}

export function readAgentFile(agentId: string, fileName: string): string | null {
  const filePath = path.join(OPENCLAW_PATH, agentId, 'agent', fileName)
  
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
  } catch (e) {}
  
  return null
}
