import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { NotionAPI } from './api.js'
import { createNotionTools } from './tools.js'

export class NotionConnector implements DirectConnector {
  readonly id = 'notion'
  readonly name = 'Notion'

  private api = new NotionAPI()
  private tools: AgentTool[] = []

  setToken(accessToken: string): void {
    this.api.setToken(accessToken)
    this.tools = createNotionTools(this.api)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const user = await this.api.getCurrentUser()
      return { success: true, info: `Connected as ${user.name}` }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
