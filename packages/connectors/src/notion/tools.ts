import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import { type NotionAPI, blockToText, getPageTitle } from './api.js'

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

export function createNotionTools(api: NotionAPI): AgentTool[] {
  return [
    defineTool({
      name: 'notion_search',
      label: 'Search Notion',
      description: '[Notion] Search across all pages and databases you have access to.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query' }),
        filter: Type.Optional(
          Type.String({ description: '"page" or "database" to filter results type' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const filter =
            params.filter === 'page' || params.filter === 'database'
              ? { value: params.filter as 'page' | 'database', property: 'object' as const }
              : undefined
          const results = await api.search(params.query, filter)
          const summary = results.results.map((r) => {
            const isPage = 'properties' in r
            const title = isPage
              ? getPageTitle(r as import('./api.js').NotionPage)
              : ((r as import('./api.js').NotionDatabase).title?.[0]?.plain_text ?? r.id)
            return { id: r.id, url: r.url, title }
          })
          return toolResult(JSON.stringify(summary, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'notion_get_page',
      label: 'Get Page',
      description: '[Notion] Get a Notion page and its content.',
      parameters: Type.Object({
        page_id: Type.String({ description: 'Notion page ID (from URL or search results)' }),
      }),
      async execute(_id, params) {
        try {
          const [page, blocks] = await Promise.all([
            api.getPage(params.page_id),
            api.getPageBlocks(params.page_id),
          ])
          const title = getPageTitle(page)
          const content = blocks.results.map(blockToText).join('\n')
          return toolResult(
            `# ${title}\nURL: ${page.url}\nLast edited: ${page.last_edited_time}\n\n${content}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'notion_create_page',
      label: 'Create Page',
      description: '[Notion] Create a new Notion page inside a parent page or database.',
      parameters: Type.Object({
        parent_id: Type.String({ description: 'ID of the parent page or database' }),
        parent_type: Type.String({ description: '"page" or "database"' }),
        title: Type.String({ description: 'Page title' }),
        content: Type.Optional(Type.String({ description: 'Page content as plain text' })),
      }),
      async execute(_id, params) {
        try {
          const parent =
            params.parent_type === 'database'
              ? { database_id: params.parent_id }
              : { page_id: params.parent_id }

          const properties: Record<string, unknown> = {
            title: { title: [{ type: 'text', text: { content: params.title } }] },
          }

          const children = params.content
            ? [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: { rich_text: [{ type: 'text', text: { content: params.content } }] },
                },
              ]
            : undefined

          const page = await api.createPage(parent, properties, children)
          return toolResult(`Page created: ${page.url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'notion_append_content',
      label: 'Append to Page',
      description: '[Notion] Append text content to an existing Notion page.',
      parameters: Type.Object({
        page_id: Type.String({ description: 'Notion page ID' }),
        content: Type.String({ description: 'Text to append to the page' }),
      }),
      async execute(_id, params) {
        try {
          const paragraphs = params.content.split('\n\n').filter(Boolean)
          const blocks = paragraphs.map((text) => ({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
          }))
          await api.appendBlocks(params.page_id, blocks)
          return toolResult('Content appended successfully.')
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'notion_query_database',
      label: 'Query Database',
      description: '[Notion] Query a Notion database with optional filters.',
      parameters: Type.Object({
        database_id: Type.String({ description: 'Notion database ID' }),
        filter_json: Type.Optional(
          Type.String({ description: 'Filter object as JSON string (Notion filter format)' }),
        ),
        page_size: Type.Optional(Type.Number({ description: 'Number of results (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const filter = params.filter_json ? JSON.parse(params.filter_json) : undefined
          const result = await api.queryDatabase(params.database_id, {
            filter,
            page_size: params.page_size ?? 20,
          })
          const rows = result.results.map((r) => ({
            id: r.id,
            title: getPageTitle(r),
            url: r.url,
            last_edited: r.last_edited_time,
            properties: Object.entries(r.properties).reduce<Record<string, unknown>>(
              (acc, [key, val]) => {
                const v = val as { type?: string; [k: string]: unknown }
                if (v.type === 'title') acc[key] = getPageTitle(r)
                else if (v.type === 'rich_text')
                  acc[key] = (v.rich_text as Array<{ plain_text: string }>)
                    ?.map((t) => t.plain_text)
                    .join('')
                else if (v.type === 'number') acc[key] = v.number
                else if (v.type === 'select')
                  acc[key] = (v.select as { name?: string } | null)?.name
                else if (v.type === 'multi_select')
                  acc[key] = (v.multi_select as Array<{ name: string }>)?.map((s) => s.name)
                else if (v.type === 'checkbox') acc[key] = v.checkbox
                else if (v.type === 'date') acc[key] = (v.date as { start?: string } | null)?.start
                else if (v.type === 'url') acc[key] = v.url
                else if (v.type === 'email') acc[key] = v.email
                return acc
              },
              {},
            ),
          }))
          return toolResult(JSON.stringify(rows, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'notion_update_page',
      label: 'Update Page Properties',
      description: '[Notion] Update properties of a Notion page (for database entries).',
      parameters: Type.Object({
        page_id: Type.String({ description: 'Notion page ID' }),
        properties_json: Type.String({
          description: 'Properties to update as JSON string (Notion properties format)',
        }),
      }),
      async execute(_id, params) {
        try {
          const properties = JSON.parse(params.properties_json)
          const page = await api.updatePage(params.page_id, properties)
          return toolResult(`Page updated: ${page.url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
