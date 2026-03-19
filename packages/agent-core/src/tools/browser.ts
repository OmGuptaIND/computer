import { execSync } from 'node:child_process'

export interface BrowserToolInput {
  operation: 'fetch' | 'screenshot' | 'extract'
  url: string
  selector?: string
}

export const browserToolDefinition = {
  name: 'browser',
  description:
    'Fetch web pages, extract content, or take screenshots. ' +
    "Use 'fetch' to get page content as text, 'extract' to get specific elements via CSS selector, " +
    "'screenshot' to capture a page image (requires Playwright).",
  parameters: {
    type: 'object' as const,
    properties: {
      operation: {
        type: 'string',
        enum: ['fetch', 'screenshot', 'extract'],
      },
      url: {
        type: 'string',
        description: 'URL to fetch',
      },
      selector: {
        type: 'string',
        description: 'CSS selector for extract operation',
      },
    },
    required: ['operation', 'url'],
  },
}

/**
 * Simple browser tool using curl for v0.1.
 * TODO: Upgrade to Playwright for full browser automation.
 */
export function executeBrowser(input: BrowserToolInput): string {
  const { operation, url, selector } = input

  try {
    switch (operation) {
      case 'fetch': {
        const result = execSync(
          `curl -sL --max-time 15 --max-filesize 5000000 "${url}" | head -c 100000`,
          { encoding: 'utf-8', timeout: 20_000 },
        )
        return result || '(empty response)'
      }

      case 'extract': {
        // For v0.1, fall back to fetch + naive extraction
        // TODO: Use Playwright for proper DOM querying
        const html = execSync(`curl -sL --max-time 15 "${url}" | head -c 200000`, {
          encoding: 'utf-8',
          timeout: 20_000,
        })
        if (selector) {
          return `Extracted from ${url} (selector: ${selector}):\n\nNote: Full CSS selector extraction requires Playwright. Showing raw HTML for now.\n\n${html.slice(0, 50_000)}`
        }
        return html.slice(0, 50_000)
      }

      case 'screenshot': {
        return 'Screenshot requires Playwright. Install with: npx playwright install chromium'
      }

      default:
        return `Unknown operation: ${operation}`
    }
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}
