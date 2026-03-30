import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import type { TelegramBotAPI } from './api.js'

function toolResult(output: string, isError = false) {
  return { content: [{ type: 'text' as const, text: output }], details: { raw: output, isError } }
}

function defineTool<T extends TSchema>(
  def: Omit<AgentTool<T>, 'execute'> & {
    execute: (
      id: string,
      params: Static<T>,
      signal?: AbortSignal,
    ) => Promise<AgentToolResult<unknown>>
  },
): AgentTool {
  return def as AgentTool
}

export function createTelegramTools(
  api: TelegramBotAPI,
  ownerChatId: number | null = null,
): AgentTool[] {
  const ownerDesc = ownerChatId
    ? ` Defaults to owner chat ID (${ownerChatId}) if omitted.`
    : ' Required — a chat ID number or @username.'

  return [
    defineTool({
      name: 'telegram_send_message',
      label: 'Send Message',
      description: '[Telegram] Send a message to a Telegram chat, group, or channel.',
      parameters: Type.Object({
        chat_id: Type.Optional(
          Type.String({
            description: `Chat ID or username (e.g. "@mychannel" or "123456789").${ownerDesc}`,
          }),
        ),
        text: Type.String({ description: 'Message text (supports Markdown)' }),
        parse_mode: Type.Optional(
          Type.String({ description: '"Markdown" or "HTML" for formatting' }),
        ),
        reply_to_message_id: Type.Optional(Type.Number({ description: 'Message ID to reply to' })),
      }),
      async execute(_id, params) {
        try {
          const rawId = params.chat_id ?? (ownerChatId != null ? String(ownerChatId) : null)
          if (!rawId)
            return toolResult('Error: chat_id is required (no owner chat ID configured)', true)
          const chatId = Number.isNaN(Number(rawId)) ? rawId : Number(rawId)
          const msg = await api.sendMessage(chatId, params.text, {
            parse_mode: params.parse_mode as 'Markdown' | 'HTML' | undefined,
            reply_to_message_id: params.reply_to_message_id,
          })
          return toolResult(`Message sent. ID: ${msg.message_id}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'telegram_get_updates',
      label: 'Get Updates',
      description: '[Telegram] Get recent messages received by the bot.',
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ description: 'Max updates to return (default: 10)' })),
        offset: Type.Optional(Type.Number({ description: 'Offset to mark updates as read' })),
      }),
      async execute(_id, params) {
        try {
          const updates = await api.getUpdates({ limit: params.limit ?? 10, offset: params.offset })
          if (!updates.length) return toolResult('No new updates.')
          const summary = updates.map((u) => {
            const msg = u.message ?? u.channel_post
            return {
              update_id: u.update_id,
              chat_id: msg?.chat.id,
              chat_name: msg?.chat.title ?? msg?.chat.username ?? msg?.chat.first_name,
              from: msg?.from?.username ?? msg?.from?.first_name,
              text: msg?.text,
              date: msg ? new Date(msg.date * 1000).toISOString() : null,
            }
          })
          return toolResult(JSON.stringify(summary, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'telegram_get_chat',
      label: 'Get Chat Info',
      description: '[Telegram] Get information about a chat, group, or channel.',
      parameters: Type.Object({
        chat_id: Type.String({ description: 'Chat ID or username (e.g. "@mychannel")' }),
      }),
      async execute(_id, params) {
        try {
          const chatId = Number.isNaN(Number(params.chat_id))
            ? params.chat_id
            : Number(params.chat_id)
          const chat = await api.getChat(chatId)
          return toolResult(JSON.stringify(chat, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'telegram_forward_message',
      label: 'Forward Message',
      description: '[Telegram] Forward a message from one chat to another.',
      parameters: Type.Object({
        to_chat_id: Type.String({ description: 'Destination chat ID or username' }),
        from_chat_id: Type.String({ description: 'Source chat ID or username' }),
        message_id: Type.Number({ description: 'Message ID to forward' }),
      }),
      async execute(_id, params) {
        try {
          const toId = Number.isNaN(Number(params.to_chat_id))
            ? params.to_chat_id
            : Number(params.to_chat_id)
          const fromId = Number.isNaN(Number(params.from_chat_id))
            ? params.from_chat_id
            : Number(params.from_chat_id)
          const msg = await api.forwardMessage(toId, fromId, params.message_id)
          return toolResult(`Message forwarded. New message ID: ${msg.message_id}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
