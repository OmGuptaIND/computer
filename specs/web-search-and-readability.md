# Web Search & Smart Content Extraction

## Overview

Two capabilities that bring Anton closer to parity with Claude Code's web features:

1. **Web Search** — Search the web via Brave Search API, configured as a connector in Settings
2. **Smart Content Extraction** — Browser tool upgraded with Readability + Turndown for clean markdown output instead of raw HTML

## Web Search (`web_search` tool)

### How it works

- The `web_search` tool is **always registered** in every session
- When a search connector is configured, it performs real web searches
- When not configured, it returns a helpful error guiding the user to Settings → Connectors
- This means Anton always *knows* it can search — it just might need the user to enable it first
- **Priority order**: SearXNG (free) is preferred over Brave (paid) when both are configured

### Search providers

#### SearXNG (free, self-hosted) — recommended for deployments

- Self-hosted meta search engine: aggregates results from Google, Bing, DuckDuckGo
- No API keys, no per-user cost — you host one instance, all users get search
- Deploy via Docker: `docker run -p 8080:8080 searxng/searxng`
- JSON API: `GET /search?q=query&format=json`
- Connector ID: `searxng`, requires `SEARXNG_URL`

#### Brave Search (paid) — for individual users

- Endpoint: `https://api.search.brave.com/res/v1/web/search`
- Auth: `X-Subscription-Token` header with API key
- Pricing: starts at $4/month at https://brave.com/search/api/
- Returns: titles, URLs, description snippets, and age of results
- Connector ID: `brave-search`, requires `BRAVE_SEARCH_API_KEY`

### Tool parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `count` | number | 10 | Number of results (max 20) |
| `offset` | number | 0 | Pagination offset |
| `freshness` | enum | — | `pd` (day), `pw` (week), `pm` (month), `py` (year) |
| `country` | string | — | Country code, e.g. "US", "GB" |

### Connector setup

Brave Search appears in the **Connectors** registry (Settings → Connectors → Apps tab):
- Type: `api` (not MCP — no subprocess needed)
- Required: `BRAVE_SEARCH_API_KEY`
- When the user enters their API key and clicks Connect, it's stored in `~/.anton/config.yaml` under `connectors`
- The connector shows as "Connected — 1 tool available" in the UI

### Config format

```yaml
# ~/.anton/config.yaml — Option A: SearXNG (free)
connectors:
  - id: searxng
    name: Web Search
    type: api
    baseUrl: "https://search.yourdomain.com"
    enabled: true

# Option B: Brave Search (paid)
connectors:
  - id: brave-search
    name: Brave Search
    type: api
    apiKey: "BSA..."
    enabled: true
```

## Smart Content Extraction (upgraded `browser` tool)

### Before

The browser tool used raw `curl` output — the model received full HTML including nav bars, footers, scripts, and styling. Unusable for most pages.

### After

The browser tool now uses a three-stage pipeline:

1. **Fetch**: `curl` downloads the HTML (unchanged)
2. **Parse**: `linkedom` creates a DOM from the HTML string (no browser needed)
3. **Extract**: `@mozilla/readability` extracts the article content, stripping navigation, ads, footers
4. **Convert**: `turndown` converts the clean HTML to markdown

### Why these libraries

- **linkedom** — Lightweight DOM implementation in pure JS. Unlike jsdom, it's fast and doesn't pull in a full browser engine. Readability needs a `document` object to work with, and linkedom provides exactly that.
- **@mozilla/readability** — The same algorithm Firefox Reader View uses. Scores DOM nodes to find the "article" content and strips everything else. Handles blogs, news sites, docs, etc.
- **turndown** — HTML→markdown converter. Configured with ATX headings, fenced code blocks, and removal of script/style/nav/footer/header/noscript/iframe tags.

### Fallback chain

1. Readability extracts article → Turndown converts to markdown *(best case)*
2. Readability fails → Turndown converts full `<body>` to markdown *(fallback)*
3. No body found → Return truncated raw HTML *(last resort)*

### Extract operation

The `extract` operation now uses linkedom for proper CSS selector support:
```
browser({ operation: 'extract', url: '...', selector: '.article-content' })
```
Each matched element is converted to markdown individually.

## Files changed

| File | Change |
|------|--------|
| `packages/agent-core/src/tools/web-search.ts` | New — Brave Search API client |
| `packages/agent-core/src/tools/browser.ts` | Rewritten — Readability + Turndown pipeline |
| `packages/agent-core/src/agent.ts` | Always-register web_search tool with graceful fallback |
| `packages/agent-config/src/config.ts` | Brave Search in connector registry + network allowlist |
| `packages/agent-config/prompts/system.md` | Updated tool descriptions |
| `packages/agent-server/src/server.ts` | API connectors show as "connected" in UI |
| `packages/desktop/src/components/connectors/ConnectorsPage.tsx` | API connector env→apiKey mapping |
| `packages/agent-core/package.json` | Added @mozilla/readability, turndown, linkedom |

## Dependencies added

| Package | Version | Purpose |
|---------|---------|---------|
| `@mozilla/readability` | latest | Article content extraction (Firefox Reader View algorithm) |
| `turndown` | latest | HTML to markdown conversion |
| `linkedom` | latest | Lightweight DOM implementation for server-side HTML parsing |
| `@types/turndown` | latest (dev) | TypeScript types for turndown |
