const GSC_BASE = 'https://www.googleapis.com/webmasters/v3'
const INSPECTION_BASE = 'https://searchconsole.googleapis.com/v1'

export interface GscSite {
  siteUrl: string
  permissionLevel: string
}

export interface GscSearchAnalyticsRow {
  keys?: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GscSearchAnalyticsResponse {
  rows?: GscSearchAnalyticsRow[]
  responseAggregationType?: string
}

export interface GscSitemap {
  path: string
  lastSubmitted?: string
  isPending?: boolean
  isSitemapsIndex?: boolean
  type?: string
  lastDownloaded?: string
  warnings?: string
  errors?: string
  contents?: Array<{ type: string; submitted: string; indexed: string }>
}

export interface GscUrlInspectionResult {
  inspectionResult?: {
    inspectionResultLink?: string
    indexStatusResult?: {
      verdict?: string
      coverageState?: string
      robotsTxtState?: string
      indexingState?: string
      lastCrawlTime?: string
      pageFetchState?: string
      googleCanonical?: string
      userCanonical?: string
      sitemap?: string[]
      referringUrls?: string[]
      crawledAs?: string
    }
    mobileUsabilityResult?: {
      verdict?: string
      issues?: Array<{ issueType?: string; message?: string }>
    }
    richResultsResult?: {
      verdict?: string
      detectedItems?: Array<{ richResultType?: string }>
    }
  }
}

export class GoogleSearchConsoleAPI {
  private token = ''

  setToken(token: string): void {
    this.token = token
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Search Console API ${res.status}: ${text}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  async listSites(): Promise<GscSite[]> {
    const data = await this.request<{ siteEntry?: GscSite[] }>(`${GSC_BASE}/sites`)
    return data.siteEntry ?? []
  }

  async querySarchAnalytics(
    siteUrl: string,
    opts: {
      startDate: string
      endDate: string
      dimensions?: Array<'query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date'>
      rowLimit?: number
      startRow?: number
      dimensionFilterGroups?: unknown[]
      type?: 'web' | 'image' | 'video' | 'news'
    },
  ): Promise<GscSearchAnalyticsResponse> {
    const body = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions ?? ['query'],
      rowLimit: opts.rowLimit ?? 25,
      startRow: opts.startRow ?? 0,
      ...(opts.dimensionFilterGroups ? { dimensionFilterGroups: opts.dimensionFilterGroups } : {}),
      ...(opts.type ? { type: opts.type } : {}),
    }
    return this.request(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async listSitemaps(siteUrl: string): Promise<GscSitemap[]> {
    const data = await this.request<{ sitemap?: GscSitemap[] }>(
      `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    )
    return data.sitemap ?? []
  }

  async submitSitemap(siteUrl: string, feedpath: string): Promise<void> {
    await this.request(
      `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
      { method: 'PUT' },
    )
  }

  async deleteSitemap(siteUrl: string, feedpath: string): Promise<void> {
    await this.request(
      `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
      { method: 'DELETE' },
    )
  }

  async inspectUrl(siteUrl: string, inspectionUrl: string): Promise<GscUrlInspectionResult> {
    return this.request(`${INSPECTION_BASE}/urlInspection/index:inspect`, {
      method: 'POST',
      body: JSON.stringify({ inspectionUrl, siteUrl }),
    })
  }
}
