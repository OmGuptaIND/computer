const BASE = 'https://public-api.granola.ai/v1'

export interface GranolaNote {
  id: string
  title: string
  created_at: string
  updated_at: string
  owner?: {
    id: string
    name: string
    email: string
  }
  summary?: {
    text?: string
    sections?: Array<{
      title: string
      content: string
    }>
  }
}

export interface GranolaTranscriptEntry {
  speaker: string
  text: string
  start_time?: number
  end_time?: number
}

export interface GranolaFullNote extends GranolaNote {
  transcript?: GranolaTranscriptEntry[]
}

export interface GranolaListResponse {
  notes: GranolaNote[]
  next_cursor?: string
  has_more: boolean
}

export class GranolaAPI {
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
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Granola API ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  async listNotes(
    opts: {
      pageSize?: number
      cursor?: string
      createdAfter?: string
      createdBefore?: string
      updatedAfter?: string
    } = {},
  ): Promise<GranolaListResponse> {
    const params = new URLSearchParams()
    if (opts.pageSize) params.set('page_size', String(Math.min(opts.pageSize, 30)))
    if (opts.cursor) params.set('cursor', opts.cursor)
    if (opts.createdAfter) params.set('created_after', opts.createdAfter)
    if (opts.createdBefore) params.set('created_before', opts.createdBefore)
    if (opts.updatedAfter) params.set('updated_after', opts.updatedAfter)
    const qs = params.toString()
    return this.request(`/notes${qs ? `?${qs}` : ''}`)
  }

  async getNote(id: string, includeTranscript = false): Promise<GranolaFullNote> {
    const qs = includeTranscript ? '?include=transcript' : ''
    return this.request(`/notes/${id}${qs}`)
  }
}
