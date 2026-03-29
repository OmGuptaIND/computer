const BASE = 'https://gmail.googleapis.com/gmail/v1'

export interface GmailMessage {
  id: string
  threadId: string
  snippet?: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{ mimeType: string; body?: { data?: string } }>
  }
  labelIds?: string[]
  internalDate?: string
}

export interface GmailThread {
  id: string
  snippet: string
  messages?: GmailMessage[]
}

export class GmailAPI {
  private token = ''

  setToken(token: string): void {
    this.token = token
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gmail API ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  async getProfile(): Promise<{ emailAddress: string; messagesTotal: number }> {
    return this.request('/users/me/profile')
  }

  async listMessages(opts: {
    q?: string
    maxResults?: number
    labelIds?: string[]
    pageToken?: string
  } = {}): Promise<{ messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string; resultSizeEstimate?: number }> {
    const params = new URLSearchParams()
    if (opts.q) params.set('q', opts.q)
    if (opts.maxResults) params.set('maxResults', String(opts.maxResults))
    if (opts.labelIds?.length) params.set('labelIds', opts.labelIds.join(','))
    if (opts.pageToken) params.set('pageToken', opts.pageToken)
    return this.request(`/users/me/messages?${params}`)
  }

  async getMessage(id: string, format: 'full' | 'metadata' | 'minimal' = 'full'): Promise<GmailMessage> {
    return this.request(`/users/me/messages/${id}?format=${format}`)
  }

  async sendMessage(raw: string): Promise<{ id: string; threadId: string }> {
    return this.request('/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw }),
    })
  }

  async trashMessage(id: string): Promise<void> {
    await this.request(`/users/me/messages/${id}/trash`, { method: 'POST' })
  }

  async modifyMessage(id: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void> {
    await this.request(`/users/me/messages/${id}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    })
  }

  async listLabels(): Promise<{ labels: Array<{ id: string; name: string; type: string }> }> {
    return this.request('/users/me/labels')
  }

  async createDraft(raw: string): Promise<{ id: string }> {
    return this.request('/users/me/drafts', {
      method: 'POST',
      body: JSON.stringify({ message: { raw } }),
    })
  }
}

/** Build a base64url-encoded RFC 2822 email message */
export function buildRawEmail(opts: {
  to: string
  from?: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
  references?: string
  cc?: string
}): string {
  const lines: string[] = []
  if (opts.from) lines.push(`From: ${opts.from}`)
  lines.push(`To: ${opts.to}`)
  if (opts.cc) lines.push(`Cc: ${opts.cc}`)
  lines.push(`Subject: ${opts.subject}`)
  lines.push('Content-Type: text/plain; charset=utf-8')
  lines.push('MIME-Version: 1.0')
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references) lines.push(`References: ${opts.references}`)
  lines.push('')
  lines.push(opts.body)

  const raw = lines.join('\r\n')
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Extract plain text body from a message */
export function extractBody(msg: GmailMessage): string {
  const payload = msg.payload
  if (!payload) return ''

  // Try top-level body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  }

  // Try parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
      }
    }
  }
  return msg.snippet ?? ''
}

/** Extract a header value from a message */
export function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}
