const BASE = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

export interface NotionPage {
  id: string
  url: string
  created_time: string
  last_edited_time: string
  properties: Record<string, unknown>
  parent: { type: string; database_id?: string; page_id?: string }
}

export interface NotionDatabase {
  id: string
  title: Array<{ plain_text: string }>
  url: string
}

export interface NotionBlock {
  id: string
  type: string
  [key: string]: unknown
}

export class NotionAPI {
  private token = ''
  private tokenProvider?: () => Promise<string>

  setToken(token: string): void {
    this.token = token
  }

  setTokenProvider(fn: () => Promise<string>): void {
    this.tokenProvider = fn
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.tokenProvider ? await this.tokenProvider() : this.token
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': VERSION,
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Notion API ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  async search(
    query: string,
    filter?: { value: 'page' | 'database'; property: 'object' },
  ): Promise<{
    results: Array<NotionPage | NotionDatabase>
    next_cursor: string | null
  }> {
    return this.request('/search', {
      method: 'POST',
      body: JSON.stringify({ query, filter, page_size: 20 }),
    })
  }

  async getPage(pageId: string): Promise<NotionPage> {
    return this.request(`/pages/${pageId}`)
  }

  async getPageBlocks(pageId: string): Promise<{ results: NotionBlock[] }> {
    return this.request(`/blocks/${pageId}/children?page_size=100`)
  }

  async createPage(
    parent: { database_id?: string; page_id?: string },
    properties: Record<string, unknown>,
    children?: unknown[],
  ): Promise<NotionPage> {
    const parentObj = parent.database_id
      ? { database_id: parent.database_id }
      : { page_id: parent.page_id }
    return this.request('/pages', {
      method: 'POST',
      body: JSON.stringify({ parent: parentObj, properties, children }),
    })
  }

  async updatePage(pageId: string, properties: Record<string, unknown>): Promise<NotionPage> {
    return this.request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    })
  }

  async archivePage(pageId: string): Promise<void> {
    await this.request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    })
  }

  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.request(`/databases/${databaseId}`)
  }

  async queryDatabase(
    databaseId: string,
    opts: {
      filter?: unknown
      sorts?: unknown[]
      page_size?: number
      start_cursor?: string
    } = {},
  ): Promise<{ results: NotionPage[]; next_cursor: string | null; has_more: boolean }> {
    return this.request(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(opts),
    })
  }

  async appendBlocks(blockId: string, children: unknown[]): Promise<void> {
    await this.request(`/blocks/${blockId}/children`, {
      method: 'PATCH',
      body: JSON.stringify({ children }),
    })
  }

  async getCurrentUser(): Promise<{ id: string; name: string; type: string }> {
    return this.request('/users/me')
  }
}

/** Extract plain text from a Notion block */
export function blockToText(block: NotionBlock): string {
  const type = block.type
  const content = block[type] as { rich_text?: Array<{ plain_text: string }> } | undefined
  if (content?.rich_text) {
    return content.rich_text.map((r) => r.plain_text).join('')
  }
  return `[${type}]`
}

/** Extract title from page properties */
export function getPageTitle(page: NotionPage): string {
  for (const val of Object.values(page.properties)) {
    const prop = val as { type?: string; title?: Array<{ plain_text: string }> }
    if (prop.type === 'title' && prop.title) {
      return prop.title.map((t) => t.plain_text).join('')
    }
  }
  return page.id
}
