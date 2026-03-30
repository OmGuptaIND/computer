import { Type, type TSchema, type Static } from '@sinclair/typebox'
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { GoogleSheetsAPI, valuesToMarkdownTable } from './api.js'

function toolResult(output: string, isError = false) {
  return { content: [{ type: 'text' as const, text: output }], details: { raw: output, isError } }
}

function defineTool<T extends TSchema>(
  def: Omit<AgentTool<T>, 'execute'> & {
    execute: (id: string, params: Static<T>, signal?: AbortSignal) => Promise<AgentToolResult<unknown>>
  },
): AgentTool {
  return def as AgentTool
}

export function createGoogleSheetsTools(api: GoogleSheetsAPI): AgentTool[] {
  return [

    defineTool({
      name: 'gsheets_list_spreadsheets',
      label: 'List Spreadsheets',
      description: '[Google Sheets] List recent Google Sheets spreadsheets.',
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ description: 'Max spreadsheets to return (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const sheets = await api.listSpreadsheets(params.limit ?? 20)
          if (!sheets.length) return toolResult('No spreadsheets found.')
          const lines = sheets.map((s) => `- [${s.name}](${s.webViewLink}) (id: ${s.id}, modified: ${s.modifiedTime})`)
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsheets_get_spreadsheet',
      label: 'Get Spreadsheet Info',
      description: '[Google Sheets] Get metadata about a spreadsheet including its sheets/tabs.',
      parameters: Type.Object({
        spreadsheet_id: Type.String({ description: 'Spreadsheet ID (from URL)' }),
      }),
      async execute(_id, params) {
        try {
          const info = await api.getSpreadsheet(params.spreadsheet_id)
          const sheets = info.sheets.map((s) => `  - "${s.properties.title}" (id: ${s.properties.sheetId}, rows: ${s.properties.gridProperties?.rowCount ?? '?'}, cols: ${s.properties.gridProperties?.columnCount ?? '?'})`)
          return toolResult(`Spreadsheet: "${info.properties.title}"\nURL: ${info.spreadsheetUrl}\nSheets:\n${sheets.join('\n')}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsheets_read_range',
      label: 'Read Range',
      description: '[Google Sheets] Read cell values from a range (e.g. "Sheet1!A1:D10"). Returns a markdown table.',
      parameters: Type.Object({
        spreadsheet_id: Type.String({ description: 'Spreadsheet ID' }),
        range: Type.String({ description: 'A1 notation range, e.g. "Sheet1!A1:E20" or just "A1:E20" for first sheet' }),
      }),
      async execute(_id, params) {
        try {
          const result = await api.readRange(params.spreadsheet_id, params.range)
          if (!result.values?.length) return toolResult('Range is empty.')
          return toolResult(valuesToMarkdownTable(result.values))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsheets_write_range',
      label: 'Write Range',
      description: '[Google Sheets] Write values to a cell range. Overwrites existing content.',
      parameters: Type.Object({
        spreadsheet_id: Type.String({ description: 'Spreadsheet ID' }),
        range: Type.String({ description: 'A1 notation range, e.g. "Sheet1!A1"' }),
        values: Type.Array(Type.Array(Type.String(), { description: 'A row of cell values' }), { description: 'Array of rows, each row is an array of cell values' }),
        value_input_option: Type.Optional(Type.Union([Type.Literal('RAW'), Type.Literal('USER_ENTERED')], { description: 'RAW stores values as-is; USER_ENTERED parses them like a user typing (default: USER_ENTERED)' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.writeRange(
            params.spreadsheet_id,
            params.range,
            params.values,
            (params.value_input_option as 'RAW' | 'USER_ENTERED' | undefined) ?? 'USER_ENTERED',
          )
          return toolResult(`Written: ${result.updatedRows} row(s), ${result.updatedColumns} column(s), ${result.updatedCells} cell(s).`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsheets_append_rows',
      label: 'Append Rows',
      description: '[Google Sheets] Append rows after the last row with data in a sheet.',
      parameters: Type.Object({
        spreadsheet_id: Type.String({ description: 'Spreadsheet ID' }),
        range: Type.String({ description: 'Sheet name or range to append to, e.g. "Sheet1"' }),
        values: Type.Array(Type.Array(Type.String()), { description: 'Array of rows to append' }),
      }),
      async execute(_id, params) {
        try {
          const result = await api.appendRows(params.spreadsheet_id, params.range, params.values)
          return toolResult(`Appended rows. Updated ${result.updatedCells} cell(s).`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsheets_clear_range',
      label: 'Clear Range',
      description: '[Google Sheets] Clear all values in a cell range.',
      parameters: Type.Object({
        spreadsheet_id: Type.String({ description: 'Spreadsheet ID' }),
        range: Type.String({ description: 'A1 notation range to clear, e.g. "Sheet1!A1:Z100"' }),
      }),
      async execute(_id, params) {
        try {
          await api.clearRange(params.spreadsheet_id, params.range)
          return toolResult(`Range "${params.range}" cleared.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsheets_create_spreadsheet',
      label: 'Create Spreadsheet',
      description: '[Google Sheets] Create a new Google Sheets spreadsheet.',
      parameters: Type.Object({
        title: Type.String({ description: 'Spreadsheet title' }),
      }),
      async execute(_id, params) {
        try {
          const info = await api.createSpreadsheet(params.title)
          return toolResult(`Spreadsheet created: "${info.properties.title}" (id: ${info.spreadsheetId})\n${info.spreadsheetUrl}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsheets_add_sheet',
      label: 'Add Sheet',
      description: '[Google Sheets] Add a new sheet/tab to an existing spreadsheet.',
      parameters: Type.Object({
        spreadsheet_id: Type.String({ description: 'Spreadsheet ID' }),
        title: Type.String({ description: 'Name for the new sheet tab' }),
      }),
      async execute(_id, params) {
        try {
          await api.addSheet(params.spreadsheet_id, params.title)
          return toolResult(`Sheet "${params.title}" added to spreadsheet ${params.spreadsheet_id}.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

  ]
}
