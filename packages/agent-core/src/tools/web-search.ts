export interface WebSearchInput {
  query: string
  count?: number
  offset?: number
  freshness?: 'pd' | 'pw' | 'pm' | 'py' // past day/week/month/year
  country?: string
}

interface BraveWebResult {
  title?: string
  url?: string
  description?: string
  age?: string
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] }
  query?: { original?: string }
}

/**
 * Search the web using Brave Search API.
 * Returns formatted results with title, URL, and snippet.
 */
export async function executeWebSearch(input: WebSearchInput, apiKey: string): Promise<string> {
  const { query, count = 10, offset = 0, freshness, country } = input

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 20)),
    offset: String(offset),
  })
  if (freshness) params.set('freshness', freshness)
  if (country) params.set('country', country)

  const url = `https://api.search.brave.com/res/v1/web/search?${params}`

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return `Error: Brave Search API returned ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`
  }

  const data = (await res.json()) as BraveSearchResponse
  const results = data.web?.results

  if (!results || results.length === 0) {
    return `No results found for: "${query}"`
  }

  const formatted = results.map((r, i) => {
    const parts = [`${i + 1}. **${r.title || 'Untitled'}**`]
    if (r.url) parts.push(`   ${r.url}`)
    if (r.description) parts.push(`   ${r.description}`)
    if (r.age) parts.push(`   (${r.age})`)
    return parts.join('\n')
  })

  return `Search results for "${query}":\n\n${formatted.join('\n\n')}`
}
