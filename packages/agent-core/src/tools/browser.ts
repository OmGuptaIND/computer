import { execSync } from 'node:child_process'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'

export interface BrowserToolInput {
  operation: 'fetch' | 'screenshot' | 'extract'
  url: string
  selector?: string
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

// Remove script/style/nav/footer tags
turndown.remove(['script', 'style', 'nav', 'footer', 'header', 'noscript', 'iframe'])

/**
 * Fetch raw HTML from a URL via curl.
 */
function fetchHtml(url: string, maxBytes = 500_000): string {
  return execSync(`curl -sL --max-time 15 --max-filesize 5000000 "${url}" | head -c ${maxBytes}`, {
    encoding: 'utf-8',
    timeout: 20_000,
  })
}

/**
 * Convert HTML to clean markdown using Readability + Turndown.
 * Falls back to raw Turndown conversion if Readability fails.
 */
function htmlToMarkdown(html: string, url: string): string {
  const { document } = parseHTML(html)

  // Try Readability first for article extraction
  const reader = new Readability(document, { charThreshold: 100 })
  const article = reader.parse()

  if (article?.content) {
    // Re-parse the cleaned article HTML and convert to markdown
    const { document: cleanDoc } = parseHTML(article.content)
    let md = turndown.turndown(cleanDoc.toString())

    // Prepend title if available
    if (article.title) {
      md = `# ${article.title}\n\n${md}`
    }

    return md.slice(0, 80_000)
  }

  // Fallback: convert the whole body to markdown
  const body = document.querySelector('body')
  if (body) {
    const md = turndown.turndown(body.innerHTML || body.toString())
    return md.slice(0, 80_000)
  }

  // Last resort: return truncated raw HTML
  return html.slice(0, 50_000)
}

/**
 * Browser tool: fetch web pages and extract clean markdown content.
 * Uses Readability for article extraction and Turndown for HTML→markdown.
 */
export function executeBrowser(input: BrowserToolInput): string {
  const { operation, url, selector } = input

  try {
    switch (operation) {
      case 'fetch': {
        const html = fetchHtml(url)
        if (!html) return '(empty response)'
        return htmlToMarkdown(html, url)
      }

      case 'extract': {
        const html = fetchHtml(url, 200_000)

        if (selector) {
          const { document } = parseHTML(html)
          const elements = document.querySelectorAll(selector)
          if (elements.length === 0) {
            return `No elements found matching selector: ${selector}`
          }

          const extracted = Array.from(elements)
            .map((el: Element) => turndown.turndown(el.innerHTML || el.textContent || ''))
            .join('\n\n---\n\n')

          return `Extracted ${elements.length} element(s) from ${url} (selector: ${selector}):\n\n${extracted.slice(0, 50_000)}`
        }

        // No selector — same as fetch
        return htmlToMarkdown(html, url)
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
