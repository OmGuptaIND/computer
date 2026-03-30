export interface WebSearchInput {
  query: string
  numResults?: number
  category?: string
  startPublishedDate?: string
  endPublishedDate?: string
}

export interface SearchProvider {
  baseUrl: string
  token: string
}

// ── Exa search via CF worker proxy ─────────────────────────────────

interface ExaProxyResult {
  title: string
  url: string
  text?: string
  highlights?: string[]
  summary?: string
  publishedDate?: string | null
  author?: string | null
}

interface ExaProxyResponse {
  results: ExaProxyResult[]
  error?: string
}

async function searchExa(input: WebSearchInput, provider: SearchProvider): Promise<string> {
  const { query, numResults = 10, category, startPublishedDate, endPublishedDate } = input

  const base = provider.baseUrl.replace(/\/+$/, '')

  const payload: Record<string, unknown> = {
    query,
    numResults: Math.min(numResults, 30),
  }
  if (category) payload.category = category
  if (startPublishedDate) payload.startPublishedDate = startPublishedDate
  if (endPublishedDate) payload.endPublishedDate = endPublishedDate

  const res = await fetch(`${base}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return `Error: Search proxy returned ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`
  }

  const data = (await res.json()) as ExaProxyResponse
  if (data.error) return `Error: ${data.error}`

  return formatResults(query, data.results)
}

// ── Formatting ─────────────────────────────────────────────────────

function formatResults(query: string, results: ExaProxyResult[]): string {
  if (results.length === 0) {
    return `No results found for: "${query}"`
  }

  const citationData: { i: number; t: string; d: string; u: string }[] = []

  const formatted = results.map((r, i) => {
    const title = r.title || 'Untitled'
    let domain = ''
    try {
      domain = new URL(r.url || '').hostname.replace(/^www\./, '')
    } catch {
      /* ignore */
    }
    citationData.push({ i: i + 1, t: title, d: domain, u: r.url || '' })

    const parts = [`[${i + 1}] ${title} | ${domain} — ${r.url || ''}`]
    if (r.publishedDate) parts.push(`    Published: ${r.publishedDate}`)
    if (r.author) parts.push(`    Author: ${r.author}`)
    if (r.summary) parts.push(`    Summary: ${r.summary}`)
    if (r.text) {
      // Include page content (already truncated by the proxy)
      parts.push(
        `    Content:\n${r.text
          .split('\n')
          .map((l) => `      ${l}`)
          .join('\n')}`,
      )
    } else if (r.highlights && r.highlights.length > 0) {
      parts.push(`    Highlights:\n${r.highlights.map((h) => `      - ${h}`).join('\n')}`)
    }
    return parts.join('\n')
  })

  const humanText = `Sources:\n${formatted.join('\n\n')}\n\n---\nWhen using information from these results, cite sources inline using [1], [2], etc.\nAlways include a "Sources:" footer listing the sources you referenced.`
  return `${humanText}\n<!-- citations:${JSON.stringify(citationData)} -->`
}

// ── Main entry point ────────────────────────────────────────────────

export async function executeWebSearch(
  input: WebSearchInput,
  provider: SearchProvider,
): Promise<string> {
  return searchExa(input, provider)
}
