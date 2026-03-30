import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import type { GranolaAPI } from './api.js'

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

export function createGranolaTools(api: GranolaAPI): AgentTool[] {
  return [
    defineTool({
      name: 'granola_list_notes',
      label: 'List Meeting Notes',
      description: '[Granola] List recent meeting notes. Returns titles, dates, and summaries.',
      parameters: Type.Object({
        limit: Type.Optional(
          Type.Number({ description: 'Number of notes to return (max 30, default 10)' }),
        ),
        created_after: Type.Optional(
          Type.String({
            description: 'Only notes created after this ISO 8601 date (e.g. 2024-03-01T00:00:00Z)',
          }),
        ),
        created_before: Type.Optional(
          Type.String({ description: 'Only notes created before this ISO 8601 date' }),
        ),
        updated_after: Type.Optional(
          Type.String({ description: 'Only notes updated after this ISO 8601 date' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.listNotes({
            pageSize: params.limit ?? 10,
            createdAfter: params.created_after,
            createdBefore: params.created_before,
            updatedAfter: params.updated_after,
          })
          if (!result.notes?.length) return toolResult('No meeting notes found.')
          const formatted = result.notes.map((n) => ({
            id: n.id,
            title: n.title,
            created: n.created_at,
            updated: n.updated_at,
            owner: n.owner?.name ?? null,
            summary: n.summary?.text ?? null,
          }))
          return toolResult(JSON.stringify(formatted, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'granola_get_note',
      label: 'Get Meeting Note',
      description: '[Granola] Get the full content and AI summary of a specific meeting note.',
      parameters: Type.Object({
        note_id: Type.String({ description: 'Note ID (from granola_list_notes)' }),
        include_transcript: Type.Optional(
          Type.Boolean({ description: 'Include the full meeting transcript (default: false)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const note = await api.getNote(params.note_id, params.include_transcript ?? false)

          const lines: string[] = []
          lines.push(`# ${note.title}`)
          lines.push(`Created: ${note.created_at}`)
          if (note.owner) lines.push(`Owner: ${note.owner.name} (${note.owner.email})`)
          lines.push('')

          if (note.summary?.sections?.length) {
            lines.push('## Summary')
            for (const section of note.summary.sections) {
              lines.push(`### ${section.title}`)
              lines.push(section.content)
              lines.push('')
            }
          } else if (note.summary?.text) {
            lines.push('## Summary')
            lines.push(note.summary.text)
            lines.push('')
          }

          if (note.transcript?.length) {
            lines.push('## Transcript')
            for (const entry of note.transcript) {
              lines.push(`**${entry.speaker}:** ${entry.text}`)
            }
          }

          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'granola_search_notes',
      label: 'Search Meeting Notes',
      description:
        '[Granola] Search recent meeting notes by scanning titles and summaries for a keyword.',
      parameters: Type.Object({
        query: Type.String({
          description: 'Keyword or phrase to search for in meeting titles and summaries',
        }),
        limit: Type.Optional(
          Type.Number({ description: 'How many recent notes to scan (max 30, default 20)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.listNotes({ pageSize: params.limit ?? 20 })
          if (!result.notes?.length) return toolResult('No meeting notes found.')

          const q = params.query.toLowerCase()
          const matches = result.notes.filter((n) => {
            const inTitle = n.title?.toLowerCase().includes(q)
            const inSummary =
              n.summary?.text?.toLowerCase().includes(q) ||
              n.summary?.sections?.some(
                (s) => s.content.toLowerCase().includes(q) || s.title.toLowerCase().includes(q),
              )
            return inTitle || inSummary
          })

          if (!matches.length) return toolResult(`No notes found matching "${params.query}".`)

          const formatted = matches.map((n) => ({
            id: n.id,
            title: n.title,
            created: n.created_at,
            summary: n.summary?.text ?? null,
          }))
          return toolResult(
            `Found ${matches.length} matching note(s):\n${JSON.stringify(formatted, null, 2)}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
