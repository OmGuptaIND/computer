/**
 * Telegram bot webhook handler.
 *
 * Makes Telegram a first-class interface to Anton — messages sent to the bot
 * are processed by the agent and replied to directly in Telegram.
 *
 * Each Telegram chat (chat_id) gets its own persistent session.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentConfig } from '@anton/agent-config'
import { createLogger } from '@anton/logger'

const log = createLogger('telegram')
import type { McpManager, Session } from '@anton/agent-core'
import { createSession, resumeSession } from '@anton/agent-core'
import type { ConnectorManager } from '@anton/connectors'

const TELEGRAM_API = 'https://api.telegram.org'
const MAX_MESSAGE_LENGTH = 4096

export class TelegramBotHandler {
  private token: string
  private config: AgentConfig
  private mcpManager: McpManager
  private connectorManager: ConnectorManager
  private sessions = new Map<string, Session>()
  private processing = new Set<number>() // chat IDs currently being processed

  constructor(opts: {
    token: string
    config: AgentConfig
    mcpManager: McpManager
    connectorManager: ConnectorManager
  }) {
    this.token = opts.token
    this.config = opts.config
    this.mcpManager = opts.mcpManager
    this.connectorManager = opts.connectorManager
  }

  /** Register the webhook URL with Telegram. */
  async registerWebhook(publicUrl: string): Promise<void> {
    const webhookUrl = `${publicUrl}/_anton/telegram/webhook`
    const res = await fetch(`${TELEGRAM_API}/bot${this.token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
    })
    const data = (await res.json()) as { ok: boolean; description?: string }
    if (data.ok) {
      log.info({ webhookUrl }, 'webhook registered')
    } else {
      log.error({ description: data.description }, 'webhook registration failed')
    }
  }

  /** Express-style HTTP handler for POST /_anton/telegram/webhook */
  handle(req: IncomingMessage, res: ServerResponse): void {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      // Acknowledge immediately — Telegram requires < 5s response
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))

      try {
        const update = JSON.parse(body) as TelegramUpdate
        this.handleUpdate(update).catch((err) => {
          log.error({ err }, 'error handling update')
        })
      } catch {
        // ignore malformed payloads
      }
    })
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message
    if (!msg?.text) return

    const chatId = msg.chat.id
    const text = msg.text.trim()

    // Ignore duplicate processing (e.g., retries from Telegram)
    if (this.processing.has(chatId)) return
    this.processing.add(chatId)

    try {
      // Send typing indicator
      await this.sendChatAction(chatId, 'typing')

      const session = this.getOrCreateSession(chatId)
      const response = await this.processMessage(session, text, chatId)

      if (response) {
        await this.sendMessage(chatId, response)
      }
    } finally {
      this.processing.delete(chatId)
    }
  }

  private getOrCreateSession(chatId: number): Session {
    const sessionId = `telegram-${chatId}`
    let session = this.sessions.get(sessionId)
    if (session) return session

    // Try to resume from disk first
    session =
      resumeSession(sessionId, this.config, {
        mcpManager: this.mcpManager,
        connectorManager: this.connectorManager,
      }) ?? undefined

    if (!session) {
      session = createSession(sessionId, this.config, {
        mcpManager: this.mcpManager,
        connectorManager: this.connectorManager,
      })
    }

    this.sessions.set(sessionId, session)
    return session
  }

  private async processMessage(session: Session, text: string, chatId: number): Promise<string> {
    const chunks: string[] = []
    let typingInterval: ReturnType<typeof setInterval> | null = null

    // Keep typing indicator alive during processing
    typingInterval = setInterval(() => {
      this.sendChatAction(chatId, 'typing').catch(() => {})
    }, 4000)

    try {
      for await (const event of session.processMessage(text)) {
        if (event.type === 'text') {
          chunks.push(event.content)
        }
      }
    } finally {
      if (typingInterval) clearInterval(typingInterval)
    }

    return chunks.join('')
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    // Split into chunks if over Telegram's 4096 char limit
    const chunks = splitMessage(text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      await fetch(`${TELEGRAM_API}/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
        }),
      })
    }
  }

  private async sendChatAction(chatId: number, action: string): Promise<void> {
    await fetch(`${TELEGRAM_API}/bot${this.token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    })
  }

  /** Update connector tools in all Telegram sessions. */
  refreshAllSessionTools(): void {
    for (const session of this.sessions.values()) {
      session.refreshConnectorTools()
    }
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    // Try to split at newline boundary
    let cutAt = maxLen
    if (remaining.length > maxLen) {
      const lastNewline = remaining.lastIndexOf('\n', maxLen)
      if (lastNewline > maxLen / 2) cutAt = lastNewline + 1
    }
    chunks.push(remaining.slice(0, cutAt))
    remaining = remaining.slice(cutAt)
  }
  return chunks
}

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name: string; username?: string }
    chat: { id: number; type: string; first_name?: string; username?: string }
    text?: string
    date: number
  }
}
