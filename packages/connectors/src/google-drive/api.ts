const BASE = 'https://www.googleapis.com/drive/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  createdTime?: string
  parents?: string[]
  webViewLink?: string
  webContentLink?: string
  description?: string
  starred?: boolean
  trashed?: boolean
  owners?: Array<{ displayName: string; emailAddress: string }>
}

export class GoogleDriveAPI {
  private token = ''

  setToken(token: string): void {
    this.token = token
  }

  private async request<T>(path: string, options: RequestInit = {}, baseUrl = BASE): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Google Drive API ${res.status}: ${text}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  async listFiles(opts: {
    q?: string
    pageSize?: number
    orderBy?: string
    fields?: string
  } = {}): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    const params = new URLSearchParams()
    if (opts.q) params.set('q', opts.q)
    params.set('pageSize', String(opts.pageSize ?? 20))
    params.set('orderBy', opts.orderBy ?? 'modifiedTime desc')
    params.set('fields', opts.fields ?? 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents),nextPageToken')
    return this.request(`/files?${params}`)
  }

  async getFile(fileId: string): Promise<DriveFile> {
    return this.request(`/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,createdTime,webViewLink,webContentLink,parents,description,starred,owners`)
  }

  async readFile(fileId: string): Promise<string> {
    const res = await fetch(`${BASE}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) throw new Error(`Google Drive API ${res.status}: ${await res.text()}`)
    return res.text()
  }

  async exportFile(fileId: string, mimeType: string): Promise<string> {
    const params = new URLSearchParams({ mimeType })
    const res = await fetch(`${BASE}/files/${fileId}/export?${params}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) throw new Error(`Google Drive API ${res.status}: ${await res.text()}`)
    return res.text()
  }

  async searchFiles(query: string, pageSize = 20): Promise<DriveFile[]> {
    const result = await this.listFiles({ q: `fullText contains '${query.replace(/'/g, "\\'")}'`, pageSize })
    return result.files
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    const metadata: Record<string, unknown> = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }
    if (parentId) metadata.parents = [parentId]
    return this.request('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    })
  }

  async uploadFile(name: string, content: string, mimeType: string, parentId?: string): Promise<DriveFile> {
    const metadata: Record<string, unknown> = { name }
    if (parentId) metadata.parents = [parentId]

    const boundary = '-------314159265358979323846'
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n')

    return this.request('/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body,
    }, UPLOAD_BASE)
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request(`/files/${fileId}`, { method: 'DELETE' })
  }

  async getAbout(): Promise<{ user: { displayName: string; emailAddress: string }; storageQuota: { limit: string; usage: string } }> {
    return this.request('/about?fields=user,storageQuota')
  }
}

/** Human-readable file size */
export function formatSize(bytes?: string): string {
  if (!bytes) return 'unknown size'
  const n = parseInt(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/** MIME types for Google Workspace files that need export instead of direct download */
export const GOOGLE_EXPORT_FORMATS: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}
