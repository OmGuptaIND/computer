export interface WebSearchInput {
  query: string
  count?: number
  offset?: number
  freshness?: 'pd' | 'pw' | 'pm' | 'py' // past day/week/month/year
  country?: string
}

export interface SearchProvider {
  type: 'brave' | 'searxng'
  apiKey?: string // Brave
  baseUrl?: string // SearXNG
}

// ── Brave Search ────────────────────────────────────────────────────

interface BraveWebResult {
  title?: string
  url?: string
  description?: string
  age?: string
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] }
}

async function searchBrave(input: WebSearchInput, apiKey: string): Promise<string> {
  const { query, count = 10, offset = 0, freshness, country } = input

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 20)),
    offset: String(offset),
  })
  if (freshness) params.set('freshness', freshness)
  if (country) params.set('country', country)

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
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
  return formatResults(query, data.web?.results || [])
}

// ── SearXNG (self-hosted, free) ─────────────────────────────────────

interface SearXNGResult {
  title?: string
  url?: string
  content?: string // SearXNG uses "content" instead of "description"
  publishedDate?: string
  engine?: string
}

interface SearXNGResponse {
  results?: SearXNGResult[]
  query?: string
}

async function searchSearXNG(input: WebSearchInput, baseUrl: string): Promise<string> {
  const { query, count = 10, offset = 0 } = input

  // Normalize URL — strip trailing slash
  const base = baseUrl.replace(/\/+$/, '')

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    pageno: String(Math.floor(offset / Math.max(count, 1)) + 1),
  })

  const res = await fetch(`${base}/search?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return `Error: SearXNG returned ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`
  }

  const data = (await res.json()) as SearXNGResponse
  const results = (data.results || []).slice(0, Math.min(count, 20))

  return formatResults(
    query,
    results.map((r) => ({
      title: r.title,
      url: r.url,
      description: r.content,
      age: r.publishedDate,
    })),
  )
}

// ── Shared formatting ───────────────────────────────────────────────

function formatResults(
  query: string,
  results: { title?: string; url?: string; description?: string; age?: string }[],
): string {
  if (results.length === 0) {
    return `No results found for: "${query}"`
  }

  const formatted = results.map((r, i) => {
    const title = r.title || 'Untitled'
    let domain = ''
    try {
      domain = new URL(r.url || '').hostname.replace(/^www\./, '')
    } catch {
      /* ignore */
    }
    const parts = [`[${i + 1}] ${title} | ${domain} — ${r.url || ''}`]
    if (r.description) parts.push(`    ${r.description}`)
    if (r.age) parts.push(`    (${r.age})`)
    return parts.join('\n')
  })

  return `Sources:\n${formatted.join('\n\n')}\n\n---\nWhen using information from these results, cite sources inline using [1], [2], etc.\nAlways include a "Sources:" footer listing the sources you referenced.`
}

// ── Main entry point ────────────────────────────────────────────────

export async function executeWebSearch(
  input: WebSearchInput,
  provider: SearchProvider,
): Promise<string> {
  if (provider.type === 'searxng' && provider.baseUrl) {
    return searchSearXNG(input, provider.baseUrl)
  }
  if (provider.type === 'brave' && provider.apiKey) {
    return searchBrave(input, provider.apiKey)
  }
  return 'Error: Search provider not configured correctly.'
}
