import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { LinearAPI } from './api.js'
import { createLinearTools } from './tools.js'

export class LinearConnector implements DirectConnector {
  readonly id = 'linear'
  readonly name = 'Linear'

  private api = new LinearAPI()
  private tools: AgentTool[] = []

  setToken(accessToken: string): void {
    this.api.setToken(accessToken)
    this.tools = createLinearTools(this.api)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const user = await this.api.getViewer()
      return {
        success: true,
        info: `Connected as ${user.displayName || user.name} (${user.email})`,
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
