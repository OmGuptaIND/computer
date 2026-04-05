import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { DirectConnector } from '../types.js'
import { TelegramBotAPI } from './api.js'
import { createTelegramTools } from './tools.js'

export class TelegramConnector implements DirectConnector {
  readonly id = 'telegram'
  readonly name = 'Telegram'

  private api = new TelegramBotAPI()
  private tools: AgentTool[] = []
  private ownerChatId: number | null = null

  setToken(token: string): void {
    this.api.setToken(token)
    this.tools = createTelegramTools(this.api, this.ownerChatId)
  }

  setTokenProvider(getToken: () => Promise<string>): void {
    this.api.setTokenProvider(getToken)
  }

  setOwnerChatId(chatId: number): void {
    this.ownerChatId = chatId
    this.tools = createTelegramTools(this.api, this.ownerChatId)
  }

  getTools(): AgentTool[] {
    return this.tools
  }

  async testConnection(): Promise<{ success: boolean; error?: string; info?: string }> {
    try {
      const me = await this.api.getMe()
      return { success: true, info: `Connected as @${me.username ?? me.first_name}` }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
