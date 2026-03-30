const DOCS_BASE = 'https://docs.googleapis.com/v1'
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'

export interface DocsDocument {
  documentId: string
  title: string
  body?: {
    content?: DocsStructuralElement[]
  }
  revisionId?: string
}

export interface DocsStructuralElement {
  paragraph?: {
    elements?: Array<{
      textRun?: { content: string; textStyle?: Record<string, unknown> }
      inlineObjectElement?: { inlineObjectId: string }
    }>
    paragraphStyle?: { namedStyleType?: string; headingId?: string }
  }
  table?: {
    rows?: Array<{
      tableCells?: Array<{
        content?: DocsStructuralElement[]
      }>
    }>
  }
  sectionBreak?: unknown
}

export class GoogleDocsAPI {
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
      throw new Error(`Google Docs API ${res.status}: ${text}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  async getDocument(documentId: string): Promise<DocsDocument> {
    return this.request(`${DOCS_BASE}/documents/${documentId}`)
  }

  async createDocument(title: string): Promise<DocsDocument> {
    return this.request(`${DOCS_BASE}/documents`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  }

  async insertText(documentId: string, text: string, index = 1): Promise<void> {
    await this.request(`${DOCS_BASE}/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ insertText: { location: { index }, text } }],
      }),
    })
  }

  async appendText(documentId: string, text: string): Promise<void> {
    // Get document end index first
    const doc = await this.getDocument(documentId)
    const content = doc.body?.content ?? []
    let endIndex = 1
    for (const el of content) {
      if (el.paragraph) {
        for (const elem of el.paragraph.elements ?? []) {
          if (elem.textRun?.content) {
            endIndex += elem.textRun.content.length
          }
        }
      }
    }
    // Insert before the last newline
    await this.request(`${DOCS_BASE}/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          { insertText: { location: { index: Math.max(1, endIndex - 1) }, text: `\n${text}` } },
        ],
      }),
    })
  }

  async listDocuments(
    pageSize = 20,
  ): Promise<Array<{ id: string; name: string; modifiedTime: string; webViewLink: string }>> {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.document' and trashed=false",
      pageSize: String(pageSize),
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime,webViewLink)',
    })
    const data = await this.request<{
      files: Array<{ id: string; name: string; modifiedTime: string; webViewLink: string }>
    }>(`${DRIVE_BASE}/files?${params}`)
    return data.files ?? []
  }
}

/** Extract plain text from a Google Docs document */
export function extractDocText(doc: DocsDocument): string {
  const lines: string[] = []

  function processElements(elements: DocsStructuralElement[]) {
    for (const el of elements) {
      if (el.paragraph) {
        const style = el.paragraph.paragraphStyle?.namedStyleType ?? ''
        const text = (el.paragraph.elements ?? [])
          .map((e) => e.textRun?.content ?? '')
          .join('')
          .replace(/\n$/, '')

        if (!text.trim()) {
          lines.push('')
          continue
        }

        if (style.startsWith('HEADING_')) {
          const level = Number.parseInt(style.replace('HEADING_', ''))
          lines.push(`${'#'.repeat(level)} ${text}`)
        } else {
          lines.push(text)
        }
      } else if (el.table) {
        for (const row of el.table.rows ?? []) {
          const cells = (row.tableCells ?? []).map((cell) => {
            const cellText: string[] = []
            for (const cellEl of cell.content ?? []) {
              if (cellEl.paragraph) {
                cellText.push(
                  (cellEl.paragraph.elements ?? [])
                    .map((e) => e.textRun?.content ?? '')
                    .join('')
                    .trim(),
                )
              }
            }
            return cellText.join(' ')
          })
          lines.push(`| ${cells.join(' | ')} |`)
        }
      }
    }
  }

  processElements(doc.body?.content ?? [])
  return lines.join('\n').trim()
}
