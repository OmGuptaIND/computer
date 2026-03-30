/**
 * Exa Search API client — calls through the Anton OAuth proxy.
 * The proxy holds the real Exa API key; the agent authenticates with a proxy token.
 */

export interface ExaResult {
  id: string
  url: string
  title: string
  score: number
  publishedDate?: string
  author?: string
  text?: string
  highlights?: string[]
  summary?: string
}

export class ExaAPI {
  private proxyUrl = ''
  private proxyToken = ''

  setToken(token: string): void {
    // Token format: "proxyUrl|proxyToken"
    // e.g. "https://search.antoncomputer.in|abc123"
    const sep = token.indexOf('|')
    if (sep > 0) {
      this.proxyUrl = token.slice(0, sep)
      this.proxyToken = token.slice(sep + 1)
    } else {
      // Just a token — use the default search proxy URL
      this.proxyToken = token
      this.proxyUrl = 'https://search.antoncomputer.in'
    }
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.proxyUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.proxyToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Exa proxy ${path}: ${res.status} ${err}`)
    }

    return res.json() as Promise<T>
  }

  async search(
    query: string,
    opts: {
      numResults?: number
      type?: 'auto' | 'neural' | 'keyword'
      includeDomains?: string[]
      excludeDomains?: string[]
      startPublishedDate?: string
      text?: boolean
      highlights?: boolean
      summary?: boolean
    } = {},
  ): Promise<{ results: ExaResult[] }> {
    return this.request('/search', {
      query,
      numResults: opts.numResults ?? 5,
      type: opts.type ?? 'auto',
      ...(opts.includeDomains ? { includeDomains: opts.includeDomains } : {}),
      ...(opts.excludeDomains ? { excludeDomains: opts.excludeDomains } : {}),
      ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
      contents: {
        ...(opts.text !== false ? { text: { maxCharacters: 2000 } } : {}),
        ...(opts.highlights !== false ? { highlights: { numSentences: 3 } } : {}),
        ...(opts.summary !== false ? { summary: { query } } : {}),
      },
    })
  }

  async findSimilar(
    url: string,
    opts: { numResults?: number; text?: boolean; summary?: boolean } = {},
  ): Promise<{ results: ExaResult[] }> {
    return this.request('/search/findSimilar', {
      url,
      numResults: opts.numResults ?? 5,
      contents: {
        ...(opts.text !== false ? { text: { maxCharacters: 2000 } } : {}),
        ...(opts.summary !== false ? { summary: {} } : {}),
      },
    })
  }
}
