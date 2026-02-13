import { NextResponse } from 'next/server'
import { loadAgents, getGatewayStatus, saveAgentFile } from '@/lib/server/agents'

export async function GET() {
  try {
    const [agents, gatewayStatus] = await Promise.all([
      loadAgents(),
      getGatewayStatus()
    ])
    return NextResponse.json({ agents, gatewayStatus })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { agentId, fileName, content } = await request.json()
    const success = saveAgentFile(agentId, fileName, content)
    return NextResponse.json({ success })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 })
  }
}
