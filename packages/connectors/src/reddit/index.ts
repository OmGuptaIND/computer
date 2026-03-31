import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { RedditAPI } from './api.js'
import { createRedditTools } from './tools.js'

export class RedditConnector implements DirectConnector {
  readonly id = 'reddit'
  readonly name = 'Reddit'

  private api = new RedditAPI()
  private tools: AgentTool[] = []

  setToken(accessToken: string): void {
    this.api.setToken(accessToken)
    this.tools = createRedditTools(this.api)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const me = await this.api.getMe()
      return {
        success: true,
        info: `Connected as u/${me.name} (${me.link_karma + me.comment_karma} karma)`,
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
