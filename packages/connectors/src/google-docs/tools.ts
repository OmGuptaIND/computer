import { Type, type TSchema, type Static } from '@sinclair/typebox'
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { GoogleDocsAPI, extractDocText } from './api.js'

function toolResult(output: string, isError = false) {
  return { content: [{ type: 'text' as const, text: output }], details: { raw: output, isError } }
}

function defineTool<T extends TSchema>(
  def: Omit<AgentTool<T>, 'execute'> & {
    execute: (id: string, params: Static<T>, signal?: AbortSignal) => Promise<AgentToolResult<unknown>>
  },
): AgentTool {
  return def as AgentTool
}

export function createGoogleDocsTools(api: GoogleDocsAPI): AgentTool[] {
  return [

    defineTool({
      name: 'gdocs_list_documents',
      label: 'List Documents',
      description: '[Google Docs] List recent Google Docs documents.',
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ description: 'Max documents to return (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const docs = await api.listDocuments(params.limit ?? 20)
          if (!docs.length) return toolResult('No documents found.')
          const lines = docs.map((d) => `- [${d.name}](${d.webViewLink}) (id: ${d.id}, modified: ${d.modifiedTime})`)
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdocs_get_document',
      label: 'Get Document',
      description: '[Google Docs] Get the content of a Google Doc as plain text with markdown headings.',
      parameters: Type.Object({
        document_id: Type.String({ description: 'Google Doc document ID (from URL)' }),
      }),
      async execute(_id, params) {
        try {
          const doc = await api.getDocument(params.document_id)
          const text = extractDocText(doc)
          return toolResult(`# ${doc.title}\n\n${text || '(empty document)'}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdocs_create_document',
      label: 'Create Document',
      description: '[Google Docs] Create a new Google Doc.',
      parameters: Type.Object({
        title: Type.String({ description: 'Document title' }),
        content: Type.Optional(Type.String({ description: 'Initial text content to insert' })),
      }),
      async execute(_id, params) {
        try {
          const doc = await api.createDocument(params.title)
          if (params.content) {
            await api.insertText(doc.documentId, params.content)
          }
          return toolResult(`Document created: "${doc.title}" (id: ${doc.documentId})`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdocs_append_text',
      label: 'Append Text',
      description: '[Google Docs] Append text to the end of a Google Doc.',
      parameters: Type.Object({
        document_id: Type.String({ description: 'Google Doc document ID' }),
        text: Type.String({ description: 'Text to append' }),
      }),
      async execute(_id, params) {
        try {
          await api.appendText(params.document_id, params.text)
          return toolResult(`Text appended to document ${params.document_id}.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdocs_insert_text',
      label: 'Insert Text',
      description: '[Google Docs] Insert text at a specific index in a Google Doc.',
      parameters: Type.Object({
        document_id: Type.String({ description: 'Google Doc document ID' }),
        text: Type.String({ description: 'Text to insert' }),
        index: Type.Optional(Type.Number({ description: 'Character index to insert at (default: 1, beginning of doc)' })),
      }),
      async execute(_id, params) {
        try {
          await api.insertText(params.document_id, params.text, params.index ?? 1)
          return toolResult(`Text inserted at index ${params.index ?? 1} in document ${params.document_id}.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

  ]
}
