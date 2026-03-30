import { type HighlighterCore, type LanguageInput, createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

let highlighterPromise: Promise<HighlighterCore> | null = null

const langImports: Record<string, () => LanguageInput> = {
  bash: () => import('shiki/langs/bash.mjs'),
  shell: () => import('shiki/langs/shellscript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  dockerfile: () => import('shiki/langs/dockerfile.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
}

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/vitesse-dark.mjs')],
      langs: Object.values(langImports).map((fn) => fn()),
      engine: createOnigurumaEngine(import('shiki/wasm')),
    })
  }
  return highlighterPromise
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  try {
    const h = await getHighlighter()
    const loadedLangs = h.getLoadedLanguages()
    const actualLang = (loadedLangs as string[]).includes(lang) ? lang : 'text'

    if (actualLang === 'text') {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<pre class="shiki" style="background-color:transparent"><code>${escaped}</code></pre>`
    }

    return h.codeToHtml(code, {
      lang: actualLang,
      theme: 'vitesse-dark',
    })
  } catch {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre class="shiki"><code>${escaped}</code></pre>`
  }
}
