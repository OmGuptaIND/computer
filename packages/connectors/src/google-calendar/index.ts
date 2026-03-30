import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { GoogleCalendarAPI } from './api.js'
import { createGoogleCalendarTools } from './tools.js'

export class GoogleCalendarConnector implements DirectConnector {
  readonly id = 'google-calendar'
  readonly name = 'Google Calendar'

  private api = new GoogleCalendarAPI()
  private tools: AgentTool[] = []

  setToken(accessToken: string): void {
    this.api.setToken(accessToken)
    this.tools = createGoogleCalendarTools(this.api)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const result = await this.api.listCalendars()
      const primary = result.items.find((c) => c.primary)
      return { success: true, info: `Connected — ${result.items.length} calendar(s), primary: ${primary?.summary ?? 'unknown'}` }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
