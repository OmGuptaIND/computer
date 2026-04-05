import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { SlackAPI } from './api.js'
import { createSlackTools } from './tools.js'

export class SlackConnector implements DirectConnector {
  readonly id = 'slack'
  readonly name = 'Slack'

  private api = new SlackAPI()
  private tools: AgentTool[] = []

  setToken(accessToken: string): void {
    this.api.setToken(accessToken)
    this.tools = createSlackTools(this.api)
  }

  setTokenProvider(getToken: () => Promise<string>): void {
    this.api.setTokenProvider(getToken)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const auth = await this.api.authTest()
      return {
        success: true,
        info: `Connected as ${auth.user} to ${auth.team}`,
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
