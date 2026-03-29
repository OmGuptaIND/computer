import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { GmailAPI } from './api.js'
import { createGmailTools } from './tools.js'

export class GmailConnector implements DirectConnector {
  readonly id = 'gmail'
  readonly name = 'Gmail'

  private api = new GmailAPI()
  private tools: AgentTool[] = []

  setToken(accessToken: string): void {
    this.api.setToken(accessToken)
    this.tools = createGmailTools(this.api)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const profile = await this.api.getProfile()
      return { success: true, info: `Connected as ${profile.emailAddress}` }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
