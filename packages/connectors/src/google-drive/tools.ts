import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import { GOOGLE_EXPORT_FORMATS, type GoogleDriveAPI, formatSize } from './api.js'

function toolResult(output: string, isError = false) {
  return { content: [{ type: 'text' as const, text: output }], details: { raw: output, isError } }
}

function defineTool<T extends TSchema>(
  def: Omit<AgentTool<T>, 'execute'> & {
    execute: (
      id: string,
      params: Static<T>,
      signal?: AbortSignal,
    ) => Promise<AgentToolResult<unknown>>
  },
): AgentTool {
  return def as AgentTool
}

export function createGoogleDriveTools(api: GoogleDriveAPI): AgentTool[] {
  return [
    defineTool({
      name: 'gdrive_list_files',
      label: 'List Files',
      description:
        '[Google Drive] List files in Google Drive, optionally filtered by folder or query.',
      parameters: Type.Object({
        query: Type.Optional(
          Type.String({
            description:
              'Drive query (e.g. "name contains \'report\'" or "\'folderID\' in parents")',
          }),
        ),
        page_size: Type.Optional(Type.Number({ description: 'Max results (default: 20)' })),
        order_by: Type.Optional(
          Type.String({ description: 'Sort order (default: modifiedTime desc)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.listFiles({
            q: params.query,
            pageSize: params.page_size,
            orderBy: params.order_by,
          })
          if (!result.files?.length) return toolResult('No files found.')
          const formatted = result.files.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.mimeType,
            size: formatSize(f.size),
            modified: f.modifiedTime,
            link: f.webViewLink,
          }))
          return toolResult(JSON.stringify(formatted, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdrive_search_files',
      label: 'Search Files',
      description: '[Google Drive] Search files by text content or name.',
      parameters: Type.Object({
        query: Type.String({ description: 'Text to search for across file names and content' }),
        page_size: Type.Optional(Type.Number({ description: 'Max results (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const files = await api.searchFiles(params.query, params.page_size ?? 20)
          if (!files.length) return toolResult('No files found.')
          const formatted = files.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.mimeType,
            size: formatSize(f.size),
            modified: f.modifiedTime,
            link: f.webViewLink,
          }))
          return toolResult(JSON.stringify(formatted, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdrive_get_file',
      label: 'Get File',
      description: '[Google Drive] Get metadata for a specific file.',
      parameters: Type.Object({
        file_id: Type.String({ description: 'File ID' }),
      }),
      async execute(_id, params) {
        try {
          const file = await api.getFile(params.file_id)
          return toolResult(
            JSON.stringify(
              {
                id: file.id,
                name: file.name,
                type: file.mimeType,
                size: formatSize(file.size),
                created: file.createdTime,
                modified: file.modifiedTime,
                description: file.description ?? null,
                starred: file.starred,
                owners: file.owners?.map((o) => o.emailAddress),
                webViewLink: file.webViewLink,
                downloadLink: file.webContentLink ?? null,
              },
              null,
              2,
            ),
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdrive_read_file',
      label: 'Read File',
      description:
        '[Google Drive] Read the text content of a file. Works for plain text files and Google Docs/Sheets/Slides.',
      parameters: Type.Object({
        file_id: Type.String({ description: 'File ID' }),
      }),
      async execute(_id, params) {
        try {
          const file = await api.getFile(params.file_id)
          const exportMime = GOOGLE_EXPORT_FORMATS[file.mimeType]

          let content: string
          if (exportMime) {
            // Google Workspace file — must export
            content = await api.exportFile(params.file_id, exportMime)
          } else {
            content = await api.readFile(params.file_id)
          }

          // Truncate very large files
          const maxChars = 50000
          if (content.length > maxChars) {
            content = `${content.slice(0, maxChars)}\n\n[Truncated — ${content.length - maxChars} more characters]`
          }

          return toolResult(content)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdrive_create_folder',
      label: 'Create Folder',
      description: '[Google Drive] Create a new folder in Google Drive.',
      parameters: Type.Object({
        name: Type.String({ description: 'Folder name' }),
        parent_id: Type.Optional(
          Type.String({ description: 'Parent folder ID (default: My Drive root)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const folder = await api.createFolder(params.name, params.parent_id)
          return toolResult(
            `Folder created: ${folder.name} (ID: ${folder.id})\n${folder.webViewLink ?? ''}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdrive_upload_file',
      label: 'Upload File',
      description: '[Google Drive] Upload a text file to Google Drive.',
      parameters: Type.Object({
        name: Type.String({ description: 'File name (include extension, e.g. report.txt)' }),
        content: Type.String({ description: 'File content (text)' }),
        mime_type: Type.Optional(Type.String({ description: 'MIME type (default: text/plain)' })),
        parent_id: Type.Optional(
          Type.String({ description: 'Parent folder ID (default: My Drive root)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const file = await api.uploadFile(
            params.name,
            params.content,
            params.mime_type ?? 'text/plain',
            params.parent_id,
          )
          return toolResult(
            `File uploaded: ${file.name} (ID: ${file.id})\n${file.webViewLink ?? ''}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdrive_delete_file',
      label: 'Delete File',
      description: '[Google Drive] Delete a file or folder from Google Drive.',
      parameters: Type.Object({
        file_id: Type.String({ description: 'File or folder ID to delete' }),
      }),
      async execute(_id, params) {
        try {
          await api.deleteFile(params.file_id)
          return toolResult(`File ${params.file_id} deleted.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gdrive_storage_info',
      label: 'Storage Info',
      description: '[Google Drive] Get storage quota and account info.',
      parameters: Type.Object({}),
      async execute(_id, _params) {
        try {
          const about = await api.getAbout()
          const used = Number.parseInt(about.storageQuota.usage)
          const limit = Number.parseInt(about.storageQuota.limit)
          return toolResult(
            JSON.stringify(
              {
                user: about.user.displayName,
                email: about.user.emailAddress,
                used: formatSize(String(used)),
                limit: formatSize(String(limit)),
                usedPercent: limit ? `${((used / limit) * 100).toFixed(1)}%` : 'unlimited',
              },
              null,
              2,
            ),
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
