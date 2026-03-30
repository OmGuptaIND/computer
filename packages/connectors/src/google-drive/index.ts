import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { GoogleDriveAPI } from './api.js'
import { createGoogleDriveTools } from './tools.js'

export class GoogleDriveConnector implements DirectConnector {
  readonly id = 'google-drive'
  readonly name = 'Google Drive'

  private api = new GoogleDriveAPI()
  private tools: AgentTool[] = []

  setToken(accessToken: string): void {
    this.api.setToken(accessToken)
    this.tools = createGoogleDriveTools(this.api)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const about = await this.api.getAbout()
      return {
        success: true,
        info: `Connected as ${about.user.displayName} (${about.user.emailAddress})`,
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
