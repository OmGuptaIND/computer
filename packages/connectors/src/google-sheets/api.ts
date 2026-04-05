const SHEETS_BASE = 'https://sheets.googleapis.com/v4'
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'

export interface SpreadsheetInfo {
  spreadsheetId: string
  properties: { title: string; locale?: string; timeZone?: string }
  sheets: Array<{
    properties: {
      sheetId: number
      title: string
      index: number
      sheetType: string
      gridProperties?: { rowCount: number; columnCount: number }
    }
  }>
  spreadsheetUrl: string
}

export interface ValueRange {
  range: string
  majorDimension: string
  values?: string[][]
}

export class GoogleSheetsAPI {
  private token = ''
  private tokenProvider?: () => Promise<string>

  setToken(token: string): void {
    this.token = token
  }

  setTokenProvider(fn: () => Promise<string>): void {
    this.tokenProvider = fn
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = this.tokenProvider ? await this.tokenProvider() : this.token
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Google Sheets API ${res.status}: ${text}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
    return this.request(`${SHEETS_BASE}/spreadsheets/${spreadsheetId}`)
  }

  async readRange(spreadsheetId: string, range: string): Promise<ValueRange> {
    const params = new URLSearchParams({ majorDimension: 'ROWS' })
    return this.request(
      `${SHEETS_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${params}`,
    )
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: string[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED',
  ): Promise<{ updatedCells: number; updatedRows: number; updatedColumns: number }> {
    const params = new URLSearchParams({ valueInputOption })
    return this.request(
      `${SHEETS_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${params}`,
      {
        method: 'PUT',
        body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
      },
    )
  }

  async appendRows(
    spreadsheetId: string,
    range: string,
    values: string[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED',
  ): Promise<{ updatedCells: number }> {
    const params = new URLSearchParams({ valueInputOption, insertDataOption: 'INSERT_ROWS' })
    return this.request(
      `${SHEETS_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?${params}`,
      {
        method: 'POST',
        body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
      },
    )
  }

  async clearRange(spreadsheetId: string, range: string): Promise<void> {
    await this.request(
      `${SHEETS_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
      { method: 'POST' },
    )
  }

  async createSpreadsheet(title: string): Promise<SpreadsheetInfo> {
    return this.request(`${SHEETS_BASE}/spreadsheets`, {
      method: 'POST',
      body: JSON.stringify({ properties: { title } }),
    })
  }

  async addSheet(spreadsheetId: string, title: string): Promise<void> {
    await this.request(`${SHEETS_BASE}/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }],
      }),
    })
  }

  async listSpreadsheets(
    pageSize = 20,
  ): Promise<Array<{ id: string; name: string; modifiedTime: string; webViewLink: string }>> {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
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

/** Convert a range of values to a markdown table */
export function valuesToMarkdownTable(values: string[][]): string {
  if (!values.length) return '(empty)'
  const [header, ...rows] = values
  const cols = header.length
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${Array(cols).fill('---').join(' | ')} |`,
    ...rows.map((row) => {
      const padded = [...row, ...Array(Math.max(0, cols - row.length)).fill('')]
      return `| ${padded.join(' | ')} |`
    }),
  ]
  return lines.join('\n')
}
