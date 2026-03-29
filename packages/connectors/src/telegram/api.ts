const BASE = 'https://api.telegram.org'

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: { id: number; type: string; title?: string; username?: string; first_name?: string }
  date: number
  text?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  channel_post?: TelegramMessage
}

export class TelegramBotAPI {
  private token = ''

  setToken(token: string): void {
    this.token = token
  }

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${BASE}/bot${this.token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await res.json()) as { ok: boolean; result: T; description?: string }
    if (!data.ok) {
      throw new Error(`Telegram API ${method}: ${data.description ?? 'unknown error'}`)
    }
    return data.result
  }

  async getMe(): Promise<TelegramUser> {
    return this.call('getMe')
  }

  async sendMessage(chatId: string | number, text: string, opts: {
    parse_mode?: 'Markdown' | 'HTML'
    reply_to_message_id?: number
    disable_notification?: boolean
  } = {}): Promise<TelegramMessage> {
    return this.call('sendMessage', { chat_id: chatId, text, ...opts })
  }

  async getUpdates(opts: { offset?: number; limit?: number; timeout?: number } = {}): Promise<TelegramUpdate[]> {
    return this.call('getUpdates', { limit: opts.limit ?? 10, offset: opts.offset, timeout: opts.timeout ?? 0 })
  }

  async getChat(chatId: string | number): Promise<{
    id: number
    type: string
    title?: string
    username?: string
    first_name?: string
    description?: string
    members_count?: number
  }> {
    return this.call('getChat', { chat_id: chatId })
  }

  async getChatMemberCount(chatId: string | number): Promise<number> {
    return this.call('getChatMemberCount', { chat_id: chatId })
  }

  async pinMessage(chatId: string | number, messageId: number): Promise<boolean> {
    return this.call('pinChatMessage', { chat_id: chatId, message_id: messageId })
  }

  async forwardMessage(toChatId: string | number, fromChatId: string | number, messageId: number): Promise<TelegramMessage> {
    return this.call('forwardMessage', { chat_id: toChatId, from_chat_id: fromChatId, message_id: messageId })
  }
}
