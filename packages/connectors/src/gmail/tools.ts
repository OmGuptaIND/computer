import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import { type GmailAPI, buildRawEmail, extractBody, getHeader } from './api.js'

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

export function createGmailTools(api: GmailAPI): AgentTool[] {
  return [
    defineTool({
      name: 'gmail_list_inbox',
      label: 'List Inbox',
      description: '[Gmail] List recent emails from your inbox. Supports Gmail search syntax.',
      parameters: Type.Object({
        query: Type.Optional(
          Type.String({
            description: 'Gmail search query (e.g. "from:boss@example.com is:unread")',
          }),
        ),
        max_results: Type.Optional(
          Type.Number({ description: 'Max emails to return (default: 20)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const q = params.query ? params.query : 'in:inbox'
          const list = await api.listMessages({ q, maxResults: params.max_results ?? 20 })
          if (!list.messages?.length) return toolResult('No messages found.')

          const summaries = await Promise.all(
            list.messages.slice(0, 10).map(async (m) => {
              const msg = await api.getMessage(m.id, 'metadata')
              return {
                id: m.id,
                from: getHeader(msg, 'from'),
                subject: getHeader(msg, 'subject'),
                date: getHeader(msg, 'date'),
                snippet: msg.snippet,
                unread: msg.labelIds?.includes('UNREAD'),
              }
            }),
          )
          return toolResult(JSON.stringify(summaries, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gmail_get_email',
      label: 'Get Email',
      description: '[Gmail] Get the full content of a specific email by ID.',
      parameters: Type.Object({
        message_id: Type.String({ description: 'The Gmail message ID' }),
      }),
      async execute(_id, params) {
        try {
          const msg = await api.getMessage(params.message_id, 'full')
          const result = {
            id: msg.id,
            from: getHeader(msg, 'from'),
            to: getHeader(msg, 'to'),
            cc: getHeader(msg, 'cc'),
            subject: getHeader(msg, 'subject'),
            date: getHeader(msg, 'date'),
            messageId: getHeader(msg, 'message-id'),
            body: extractBody(msg),
            labels: msg.labelIds,
          }
          return toolResult(JSON.stringify(result, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gmail_send_email',
      label: 'Send Email',
      description: '[Gmail] Send an email.',
      parameters: Type.Object({
        to: Type.String({ description: 'Recipient email address' }),
        subject: Type.String({ description: 'Email subject' }),
        body: Type.String({ description: 'Email body (plain text)' }),
        cc: Type.Optional(Type.String({ description: 'CC recipients' })),
      }),
      async execute(_id, params) {
        try {
          const profile = await api.getProfile()
          const raw = buildRawEmail({
            to: params.to,
            from: profile.emailAddress,
            subject: params.subject,
            body: params.body,
            cc: params.cc,
          })
          const sent = await api.sendMessage(raw)
          return toolResult(`Email sent. Message ID: ${sent.id}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gmail_reply_email',
      label: 'Reply to Email',
      description: '[Gmail] Reply to an existing email thread.',
      parameters: Type.Object({
        message_id: Type.String({ description: 'The message ID to reply to' }),
        body: Type.String({ description: 'Reply body (plain text)' }),
      }),
      async execute(_id, params) {
        try {
          const original = await api.getMessage(params.message_id, 'metadata')
          const profile = await api.getProfile()
          const from = getHeader(original, 'from')
          const subject = getHeader(original, 'subject')
          const msgId = getHeader(original, 'message-id')

          const raw = buildRawEmail({
            to: from,
            from: profile.emailAddress,
            subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
            body: params.body,
            inReplyTo: msgId,
            references: msgId,
          })
          const sent = await api.sendMessage(raw)
          return toolResult(`Reply sent. Message ID: ${sent.id}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gmail_search',
      label: 'Search Emails',
      description: '[Gmail] Search emails using Gmail search syntax.',
      parameters: Type.Object({
        query: Type.String({
          description: 'Gmail search query (e.g. "from:alice subject:meeting after:2024/01/01")',
        }),
        max_results: Type.Optional(Type.Number({ description: 'Max results (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const list = await api.listMessages({
            q: params.query,
            maxResults: params.max_results ?? 20,
          })
          if (!list.messages?.length) return toolResult('No messages found.')

          const summaries = await Promise.all(
            list.messages.slice(0, 15).map(async (m) => {
              const msg = await api.getMessage(m.id, 'metadata')
              return {
                id: m.id,
                from: getHeader(msg, 'from'),
                subject: getHeader(msg, 'subject'),
                date: getHeader(msg, 'date'),
                snippet: msg.snippet,
              }
            }),
          )
          return toolResult(
            `Found ${list.resultSizeEstimate ?? list.messages.length} results:\n${JSON.stringify(summaries, null, 2)}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gmail_trash_email',
      label: 'Trash Email',
      description: '[Gmail] Move an email to trash.',
      parameters: Type.Object({
        message_id: Type.String({ description: 'The Gmail message ID to trash' }),
      }),
      async execute(_id, params) {
        try {
          await api.trashMessage(params.message_id)
          return toolResult(`Email ${params.message_id} moved to trash.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gmail_mark_read',
      label: 'Mark as Read',
      description: '[Gmail] Mark an email as read.',
      parameters: Type.Object({
        message_id: Type.String({ description: 'The Gmail message ID' }),
      }),
      async execute(_id, params) {
        try {
          await api.modifyMessage(params.message_id, [], ['UNREAD'])
          return toolResult(`Email ${params.message_id} marked as read.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gmail_create_draft',
      label: 'Create Draft',
      description: '[Gmail] Create an email draft without sending.',
      parameters: Type.Object({
        to: Type.String({ description: 'Recipient email address' }),
        subject: Type.String({ description: 'Email subject' }),
        body: Type.String({ description: 'Email body (plain text)' }),
        cc: Type.Optional(Type.String({ description: 'CC recipients' })),
      }),
      async execute(_id, params) {
        try {
          const profile = await api.getProfile()
          const raw = buildRawEmail({
            to: params.to,
            from: profile.emailAddress,
            subject: params.subject,
            body: params.body,
            cc: params.cc,
          })
          const draft = await api.createDraft(raw)
          return toolResult(`Draft created. Draft ID: ${draft.id}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
