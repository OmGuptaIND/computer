/**
 * Agent tools & system prompt — shared by all sessions.
 *
 * pi SDK (OpenClaw engine) does the heavy lifting:
 * - Agentic tool-calling loop
 * - Context management (transformContext hook)
 * - Multi-model support
 * - Streaming, retries, parallel tool calls
 *
 * We add:
 * - Custom tools (shell, filesystem, browser, process, network)
 * - Skills system
 * - Desktop confirmation flow
 */

import type { AgentConfig } from '@anton/agent-config'
import { loadSystemPrompt } from '@anton/agent-config'
import type { AgentTool } from '@mariozechner/pi-agent-core'
import { Type } from '@mariozechner/pi-ai'
import type { TextContent } from '@mariozechner/pi-ai'
import { executeBrowser } from './tools/browser.js'
import { executeFilesystem } from './tools/filesystem.js'
import { executeNetwork } from './tools/network.js'
import { executeProcess } from './tools/process.js'
import { executeShell } from './tools/shell.js'

// Re-export for session.ts
export { needsConfirmation } from './tools/shell.js'

/**
 * System prompt — loaded from ~/.anton/prompts/system.md at startup.
 * Editable on the server, persists across agent updates.
 *
 * Prompt layering:
 *   ~/.anton/prompts/system.md     — base prompt (seeded from packages/agent/prompts/system.md)
 *   ~/.anton/prompts/append.md     — appended after base (optional, for user customization)
 *   ~/.anton/prompts/rules/*.md    — rules appended as sections (optional)
 *
 * Skills are appended automatically by session.ts.
 */
export const SYSTEM_PROMPT = loadSystemPrompt()

/**
 * Wrap a string result into the AgentToolResult format pi SDK expects.
 */
function toolResult(output: string, isError = false) {
  const content: TextContent[] = [{ type: 'text', text: output }]
  return { content, details: { raw: output, isError } }
}

/**
 * Build the tool set. Shared across all sessions — tools are stateless,
 * only the config (security rules) matters.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous tool array requires any
export function buildTools(config: AgentConfig): AgentTool<any>[] {
  return [
    {
      name: 'shell',
      label: 'Shell',
      description:
        'Execute a shell command on the server. Returns stdout/stderr. ' +
        'Use for running programs, installing packages, deploying code.',
      parameters: Type.Object({
        command: Type.String({ description: 'Shell command to execute' }),
        timeout_seconds: Type.Optional(
          Type.Number({ description: 'Max time in seconds (default: 30)' }),
        ),
        working_directory: Type.Optional(Type.String({ description: 'Working directory' })),
      }),
      async execute(_toolCallId, params) {
        const output = await executeShell(params, config)
        return toolResult(output)
      },
    },
    {
      name: 'filesystem',
      label: 'Filesystem',
      description:
        'Read, write, list, search, or tree files. ' +
        'Operations: read, write, list, search, tree.',
      parameters: Type.Object({
        operation: Type.Union(
          [
            Type.Literal('read'),
            Type.Literal('write'),
            Type.Literal('list'),
            Type.Literal('search'),
            Type.Literal('tree'),
          ],
          { description: 'Operation to perform' },
        ),
        path: Type.String({ description: 'File or directory path' }),
        content: Type.Optional(Type.String({ description: 'Content for write' })),
        pattern: Type.Optional(Type.String({ description: 'Pattern for search' })),
        maxDepth: Type.Optional(Type.Number({ description: 'Depth for tree/search' })),
      }),
      async execute(_toolCallId, params) {
        const output = executeFilesystem(params)
        return toolResult(output)
      },
    },
    {
      name: 'browser',
      label: 'Browser',
      description: 'Fetch web pages or extract content. Operations: fetch, extract, screenshot.',
      parameters: Type.Object({
        operation: Type.Union(
          [Type.Literal('fetch'), Type.Literal('screenshot'), Type.Literal('extract')],
          { description: 'Operation to perform' },
        ),
        url: Type.String({ description: 'URL to fetch' }),
        selector: Type.Optional(Type.String({ description: 'CSS selector for extract' })),
      }),
      async execute(_toolCallId, params) {
        const output = executeBrowser(params)
        return toolResult(output)
      },
    },
    {
      name: 'process',
      label: 'Process',
      description: 'List, inspect, or kill processes. Operations: list, info, kill.',
      parameters: Type.Object({
        operation: Type.Union([Type.Literal('list'), Type.Literal('kill'), Type.Literal('info')], {
          description: 'Operation to perform',
        }),
        pid: Type.Optional(Type.Number({ description: 'Process ID' })),
        name: Type.Optional(Type.String({ description: 'Filter by name' })),
      }),
      async execute(_toolCallId, params) {
        const output = executeProcess(params)
        return toolResult(output)
      },
    },
    {
      name: 'network',
      label: 'Network',
      description:
        'Network ops: scan ports, HTTP requests, DNS, ping. Operations: ports, curl, dns, ping.',
      parameters: Type.Object({
        operation: Type.Union(
          [Type.Literal('ports'), Type.Literal('curl'), Type.Literal('dns'), Type.Literal('ping')],
          { description: 'Operation to perform' },
        ),
        url: Type.Optional(Type.String({ description: 'URL for curl' })),
        host: Type.Optional(Type.String({ description: 'Host for dns/ping' })),
        method: Type.Optional(Type.String({ description: 'HTTP method' })),
        headers: Type.Optional(
          Type.Record(Type.String(), Type.String(), { description: 'HTTP headers' }),
        ),
        body: Type.Optional(Type.String({ description: 'Request body' })),
      }),
      async execute(_toolCallId, params) {
        const output = executeNetwork(params)
        return toolResult(output)
      },
    },
  ]
}
