import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { PolymarketAPI, type PolymarketL2Creds } from './api.js'
import { createPolymarketTools } from './tools.js'

export class PolymarketConnector implements DirectConnector {
  readonly id = 'polymarket'
  readonly name = 'Polymarket'

  private api = new PolymarketAPI()
  private tools: AgentTool[] = []

  setToken(token: string): void {
    this.api.setToken(token)
    this.tools = createPolymarketTools(this.api)
  }

  // Optional runtime metadata configuration, set by agent-server after activation
  setWalletAddress(addr: string): void {
    this.api.setWalletAddress(addr)
  }

  setApiKey(key: string): void {
    this.api.setApiKey(key)
  }

  setL2Creds(creds: PolymarketL2Creds): void {
    this.api.setL2Creds(creds)
    this.api.setMode('trade')
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      // Lightweight public call
      await this.api.searchPublic('test', { limit_per_type: 1, page: 1 })
      const cfg = this.api.getConfig()
      const mode = cfg.l2 ? 'trade' : cfg.mode
      return { success: true, info: `Connected (mode: ${mode})` }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}

