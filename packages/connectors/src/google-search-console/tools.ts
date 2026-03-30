import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import type { GoogleSearchConsoleAPI, GscSearchAnalyticsRow } from './api.js'

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

/** Format a date N days ago as YYYY-MM-DD */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export function createGoogleSearchConsoleTools(api: GoogleSearchConsoleAPI): AgentTool[] {
  return [
    defineTool({
      name: 'gsc_list_sites',
      label: 'List Sites',
      description: '[Search Console] List all verified sites in Google Search Console.',
      parameters: Type.Object({}),
      async execute(_id, _params) {
        try {
          const sites = await api.listSites()
          if (!sites.length) return toolResult('No verified sites found in Search Console.')
          const lines = sites.map((s) => `- ${s.siteUrl} (permission: ${s.permissionLevel})`)
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_search_analytics',
      label: 'Search Analytics',
      description:
        '[Search Console] Query search performance data — clicks, impressions, CTR, and average position. Defaults to the last 28 days grouped by query.',
      parameters: Type.Object({
        site_url: Type.String({
          description:
            'Site URL exactly as it appears in Search Console (e.g. https://example.com/ or sc-domain:example.com)',
        }),
        start_date: Type.Optional(
          Type.String({ description: 'Start date YYYY-MM-DD (default: 28 days ago)' }),
        ),
        end_date: Type.Optional(
          Type.String({ description: 'End date YYYY-MM-DD (default: yesterday)' }),
        ),
        dimensions: Type.Optional(
          Type.String({
            description:
              'Comma-separated dimensions to group by: query, page, country, device (default: query)',
          }),
        ),
        row_limit: Type.Optional(
          Type.Number({ description: 'Max rows to return, 1–25000 (default: 25)' }),
        ),
        type: Type.Optional(
          Type.Union(
            [
              Type.Literal('web'),
              Type.Literal('image'),
              Type.Literal('video'),
              Type.Literal('news'),
            ],
            { description: 'Search type filter (default: web)' },
          ),
        ),
        query_filter: Type.Optional(
          Type.String({ description: 'Filter to queries containing this string' }),
        ),
        page_filter: Type.Optional(
          Type.String({ description: 'Filter to pages containing this URL string' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const dims = (params.dimensions ?? 'query').split(',').map((d) => d.trim()) as Array<
            'query' | 'page' | 'country' | 'device'
          >

          const filterGroups: unknown[] = []
          if (params.query_filter) {
            filterGroups.push({
              filters: [
                { dimension: 'query', operator: 'contains', expression: params.query_filter },
              ],
            })
          }
          if (params.page_filter) {
            filterGroups.push({
              filters: [
                { dimension: 'page', operator: 'contains', expression: params.page_filter },
              ],
            })
          }

          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: params.start_date ?? daysAgo(28),
            endDate: params.end_date ?? daysAgo(1),
            dimensions: dims,
            rowLimit: params.row_limit ?? 25,
            type: params.type as 'web' | 'image' | 'video' | 'news' | undefined,
            ...(filterGroups.length ? { dimensionFilterGroups: filterGroups } : {}),
          })

          if (!result.rows?.length) return toolResult('No data found for the given filters.')

          // Build markdown table
          const dimHeaders = dims.map((d) => d.charAt(0).toUpperCase() + d.slice(1))
          const header = [...dimHeaders, 'Clicks', 'Impressions', 'CTR', 'Position'].join(' | ')
          const sep = [...dimHeaders, 'Clicks', 'Impressions', 'CTR', 'Position']
            .map(() => '---')
            .join(' | ')
          const rows = result.rows.map((r) => {
            const keys = (r.keys ?? []).join(' | ')
            const ctr = `${(r.ctr * 100).toFixed(2)}%`
            const pos = r.position.toFixed(1)
            return `${keys} | ${r.clicks} | ${r.impressions} | ${ctr} | ${pos}`
          })
          return toolResult(`| ${header} |\n| ${sep} |\n${rows.map((r) => `| ${r} |`).join('\n')}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_top_queries',
      label: 'Top Queries',
      description:
        '[Search Console] Get the top search queries for a site over the last 28 days, sorted by clicks.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        limit: Type.Optional(
          Type.Number({ description: 'Number of queries to return (default: 20)' }),
        ),
        days: Type.Optional(
          Type.Number({ description: 'Number of days to look back (default: 28)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: daysAgo(params.days ?? 28),
            endDate: daysAgo(1),
            dimensions: ['query'],
            rowLimit: params.limit ?? 20,
          })
          if (!result.rows?.length) return toolResult('No query data found.')
          const lines = result.rows.map((r, i) => {
            const query = r.keys?.[0] ?? '(unknown)'
            const ctr = `${(r.ctr * 100).toFixed(1)}%`
            return `${i + 1}. **${query}** — ${r.clicks} clicks, ${r.impressions} impressions, CTR ${ctr}, pos ${r.position.toFixed(1)}`
          })
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_top_pages',
      label: 'Top Pages',
      description: '[Search Console] Get the top performing pages for a site by clicks.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        limit: Type.Optional(
          Type.Number({ description: 'Number of pages to return (default: 20)' }),
        ),
        days: Type.Optional(
          Type.Number({ description: 'Number of days to look back (default: 28)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: daysAgo(params.days ?? 28),
            endDate: daysAgo(1),
            dimensions: ['page'],
            rowLimit: params.limit ?? 20,
          })
          if (!result.rows?.length) return toolResult('No page data found.')
          const lines = result.rows.map((r, i) => {
            const page = r.keys?.[0] ?? '(unknown)'
            const ctr = `${(r.ctr * 100).toFixed(1)}%`
            return `${i + 1}. **${page}**\n   ${r.clicks} clicks, ${r.impressions} impressions, CTR ${ctr}, avg pos ${r.position.toFixed(1)}`
          })
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_inspect_url',
      label: 'Inspect URL',
      description:
        '[Search Console] Inspect a URL to see its indexing status, crawl info, and mobile usability.',
      parameters: Type.Object({
        site_url: Type.String({
          description: 'Site URL in Search Console (must contain the inspection URL)',
        }),
        inspection_url: Type.String({
          description: 'The specific URL to inspect (must be within site_url)',
        }),
      }),
      async execute(_id, params) {
        try {
          const result = await api.inspectUrl(params.site_url, params.inspection_url)
          const r = result.inspectionResult
          if (!r) return toolResult('No inspection result returned.')

          const idx = r.indexStatusResult
          const lines: string[] = [`**URL:** ${params.inspection_url}`]

          if (idx) {
            lines.push(`**Verdict:** ${idx.verdict ?? 'unknown'}`)
            lines.push(`**Coverage:** ${idx.coverageState ?? 'unknown'}`)
            lines.push(`**Indexing state:** ${idx.indexingState ?? 'unknown'}`)
            lines.push(`**Robots.txt:** ${idx.robotsTxtState ?? 'unknown'}`)
            lines.push(`**Page fetch:** ${idx.pageFetchState ?? 'unknown'}`)
            if (idx.lastCrawlTime) lines.push(`**Last crawled:** ${idx.lastCrawlTime}`)
            if (idx.crawledAs) lines.push(`**Crawled as:** ${idx.crawledAs}`)
            if (idx.googleCanonical) lines.push(`**Google canonical:** ${idx.googleCanonical}`)
            if (idx.userCanonical) lines.push(`**User canonical:** ${idx.userCanonical}`)
          }

          if (r.mobileUsabilityResult) {
            lines.push(`\n**Mobile usability:** ${r.mobileUsabilityResult.verdict ?? 'unknown'}`)
            if (r.mobileUsabilityResult.issues?.length) {
              for (const i of r.mobileUsabilityResult.issues) {
                lines.push(`  - ${i.message ?? i.issueType}`)
              }
            }
          }

          if (r.richResultsResult) {
            lines.push(`\n**Rich results:** ${r.richResultsResult.verdict ?? 'unknown'}`)
            if (r.richResultsResult.detectedItems?.length) {
              for (const i of r.richResultsResult.detectedItems) {
                lines.push(`  - ${i.richResultType}`)
              }
            }
          }

          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_list_sitemaps',
      label: 'List Sitemaps',
      description: '[Search Console] List all sitemaps submitted for a site.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
      }),
      async execute(_id, params) {
        try {
          const sitemaps = await api.listSitemaps(params.site_url)
          if (!sitemaps.length) return toolResult('No sitemaps found.')
          const lines = sitemaps.map((s) => {
            const status = s.errors
              ? `⚠ ${s.errors} errors`
              : s.warnings
                ? `⚠ ${s.warnings} warnings`
                : '✓'
            return `- ${s.path} ${status}${s.lastSubmitted ? ` (submitted: ${s.lastSubmitted.split('T')[0]})` : ''}`
          })
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_submit_sitemap',
      label: 'Submit Sitemap',
      description: '[Search Console] Submit or resubmit a sitemap URL for a site.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        sitemap_url: Type.String({
          description: 'Full URL of the sitemap to submit (e.g. https://example.com/sitemap.xml)',
        }),
      }),
      async execute(_id, params) {
        try {
          await api.submitSitemap(params.site_url, params.sitemap_url)
          return toolResult(`Sitemap submitted: ${params.sitemap_url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_delete_sitemap',
      label: 'Delete Sitemap',
      description: '[Search Console] Remove a sitemap from Search Console.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        sitemap_url: Type.String({ description: 'Full URL of the sitemap to remove' }),
      }),
      async execute(_id, params) {
        try {
          await api.deleteSitemap(params.site_url, params.sitemap_url)
          return toolResult(`Sitemap removed: ${params.sitemap_url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_page_queries',
      label: 'Queries for a Page',
      description:
        '[Search Console] See which search queries drive traffic to a specific page URL.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        page_url: Type.String({ description: 'The exact page URL to drill into' }),
        limit: Type.Optional(Type.Number({ description: 'Rows to return (default: 25)' })),
        days: Type.Optional(Type.Number({ description: 'Days to look back (default: 28)' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: daysAgo(params.days ?? 28),
            endDate: daysAgo(1),
            dimensions: ['query'],
            rowLimit: params.limit ?? 25,
            dimensionFilterGroups: [
              { filters: [{ dimension: 'page', operator: 'equals', expression: params.page_url }] },
            ],
          })
          if (!result.rows?.length) return toolResult(`No query data found for: ${params.page_url}`)
          const lines = result.rows.map(
            (r, i) =>
              `${i + 1}. **${r.keys?.[0] ?? ''}** — ${r.clicks} clicks, ${r.impressions} imp, CTR ${(r.ctr * 100).toFixed(1)}%, pos ${r.position.toFixed(1)}`,
          )
          return toolResult(`Queries for: ${params.page_url}\n\n${lines.join('\n')}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_query_pages',
      label: 'Pages for a Query',
      description: '[Search Console] See which pages rank for a specific search query.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        query: Type.String({ description: 'The exact search query to look up' }),
        limit: Type.Optional(Type.Number({ description: 'Rows to return (default: 25)' })),
        days: Type.Optional(Type.Number({ description: 'Days to look back (default: 28)' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: daysAgo(params.days ?? 28),
            endDate: daysAgo(1),
            dimensions: ['page'],
            rowLimit: params.limit ?? 25,
            dimensionFilterGroups: [
              { filters: [{ dimension: 'query', operator: 'equals', expression: params.query }] },
            ],
          })
          if (!result.rows?.length) return toolResult(`No pages found for query: "${params.query}"`)
          const lines = result.rows.map(
            (r, i) =>
              `${i + 1}. **${r.keys?.[0] ?? ''}** — ${r.clicks} clicks, ${r.impressions} imp, CTR ${(r.ctr * 100).toFixed(1)}%, pos ${r.position.toFixed(1)}`,
          )
          return toolResult(`Pages ranking for: "${params.query}"\n\n${lines.join('\n')}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_device_breakdown',
      label: 'Device Breakdown',
      description: '[Search Console] See traffic split by device type (desktop, mobile, tablet).',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        days: Type.Optional(Type.Number({ description: 'Days to look back (default: 28)' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: daysAgo(params.days ?? 28),
            endDate: daysAgo(1),
            dimensions: ['device'],
            rowLimit: 10,
          })
          if (!result.rows?.length) return toolResult('No device data found.')
          const lines = result.rows.map(
            (r) =>
              `- **${r.keys?.[0] ?? ''}**: ${r.clicks} clicks, ${r.impressions} imp, CTR ${(r.ctr * 100).toFixed(1)}%, pos ${r.position.toFixed(1)}`,
          )
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_country_breakdown',
      label: 'Country Breakdown',
      description: '[Search Console] See traffic breakdown by country.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        limit: Type.Optional(Type.Number({ description: 'Rows to return (default: 25)' })),
        days: Type.Optional(Type.Number({ description: 'Days to look back (default: 28)' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: daysAgo(params.days ?? 28),
            endDate: daysAgo(1),
            dimensions: ['country'],
            rowLimit: params.limit ?? 25,
          })
          if (!result.rows?.length) return toolResult('No country data found.')
          const lines = result.rows.map(
            (r, i) =>
              `${i + 1}. **${(r.keys?.[0] ?? '').toUpperCase()}** — ${r.clicks} clicks, ${r.impressions} imp, CTR ${(r.ctr * 100).toFixed(1)}%, pos ${r.position.toFixed(1)}`,
          )
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_date_trend',
      label: 'Date Trend',
      description:
        '[Search Console] Daily clicks and impressions over time. Optionally filter by a specific query or page.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        days: Type.Optional(Type.Number({ description: 'Days to look back (default: 28)' })),
        query_filter: Type.Optional(Type.String({ description: 'Filter to a specific query' })),
        page_filter: Type.Optional(Type.String({ description: 'Filter to a specific page URL' })),
      }),
      async execute(_id, params) {
        try {
          const filters: unknown[] = []
          if (params.query_filter)
            filters.push({
              dimension: 'query',
              operator: 'equals',
              expression: params.query_filter,
            })
          if (params.page_filter)
            filters.push({
              dimension: 'page',
              operator: 'equals',
              expression: params.page_filter,
            })
          const result = await api.querySarchAnalytics(params.site_url, {
            startDate: daysAgo(params.days ?? 28),
            endDate: daysAgo(1),
            dimensions: ['date'],
            rowLimit: params.days ?? 28,
            ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}),
          })
          if (!result.rows?.length) return toolResult('No date trend data found.')
          const lines = result.rows.map(
            (r) =>
              `- ${r.keys?.[0] ?? ''}: ${r.clicks} clicks, ${r.impressions} imp, CTR ${(r.ctr * 100).toFixed(1)}%, pos ${r.position.toFixed(1)}`,
          )
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_compare_periods',
      label: 'Compare Periods',
      description:
        '[Search Console] Compare clicks, impressions, CTR, and position between two date ranges to spot trends.',
      parameters: Type.Object({
        site_url: Type.String({ description: 'Site URL in Search Console' }),
        period_a_start: Type.String({ description: 'Period A start YYYY-MM-DD' }),
        period_a_end: Type.String({ description: 'Period A end YYYY-MM-DD' }),
        period_b_start: Type.String({
          description: 'Period B start YYYY-MM-DD (the comparison/older period)',
        }),
        period_b_end: Type.String({ description: 'Period B end YYYY-MM-DD' }),
        dimension: Type.Optional(
          Type.Union(
            [
              Type.Literal('query'),
              Type.Literal('page'),
              Type.Literal('country'),
              Type.Literal('device'),
            ],
            { description: 'Group by this dimension (default: query)' },
          ),
        ),
        limit: Type.Optional(Type.Number({ description: 'Rows per period (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const dim = (params.dimension ?? 'query') as 'query' | 'page' | 'country' | 'device'
          const [a, b] = await Promise.all([
            api.querySarchAnalytics(params.site_url, {
              startDate: params.period_a_start,
              endDate: params.period_a_end,
              dimensions: [dim],
              rowLimit: params.limit ?? 20,
            }),
            api.querySarchAnalytics(params.site_url, {
              startDate: params.period_b_start,
              endDate: params.period_b_end,
              dimensions: [dim],
              rowLimit: params.limit ?? 20,
            }),
          ])
          const bMap = new Map<string, GscSearchAnalyticsRow>()
          for (const r of b.rows ?? []) bMap.set(r.keys?.[0] ?? '', r)

          const dimLabel = dim.charAt(0).toUpperCase() + dim.slice(1)
          const header = `| ${dimLabel} | Clicks A | Clicks B | Δ Clicks | Pos A | Pos B | Δ Pos |`
          const sep = '| --- | --- | --- | --- | --- | --- | --- |'
          const rows = (a.rows ?? []).map((r) => {
            const key = r.keys?.[0] ?? ''
            const bRow = bMap.get(key)
            const dClicks = bRow ? r.clicks - bRow.clicks : r.clicks
            const dPos = bRow ? bRow.position - r.position : 0
            return `| ${key} | ${r.clicks} | ${bRow?.clicks ?? '-'} | ${dClicks > 0 ? '+' : ''}${dClicks} | ${r.position.toFixed(1)} | ${bRow ? bRow.position.toFixed(1) : '-'} | ${dPos > 0 ? '+' : ''}${dPos.toFixed(1)} |`
          })
          return toolResult(
            `${params.period_a_start}–${params.period_a_end} vs ${params.period_b_start}–${params.period_b_end}\n\n${header}\n${sep}\n${rows.join('\n')}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gsc_inspect_url',
      label: 'Inspect URL',
      description:
        "[Search Console] Inspect a URL's indexing status, crawl info, mobile usability, and rich results.",
      parameters: Type.Object({
        site_url: Type.String({
          description: 'Site URL in Search Console (must contain the inspection URL)',
        }),
        inspection_url: Type.String({ description: 'The specific URL to inspect' }),
      }),
      async execute(_id, params) {
        try {
          const result = await api.inspectUrl(params.site_url, params.inspection_url)
          const r = result.inspectionResult
          if (!r) return toolResult('No inspection result returned.')
          const idx = r.indexStatusResult
          const lines: string[] = [`**URL:** ${params.inspection_url}`]
          if (idx) {
            lines.push(`**Verdict:** ${idx.verdict ?? 'unknown'}`)
            lines.push(`**Coverage:** ${idx.coverageState ?? 'unknown'}`)
            lines.push(`**Indexing state:** ${idx.indexingState ?? 'unknown'}`)
            lines.push(`**Robots.txt:** ${idx.robotsTxtState ?? 'unknown'}`)
            lines.push(`**Page fetch:** ${idx.pageFetchState ?? 'unknown'}`)
            if (idx.lastCrawlTime) lines.push(`**Last crawled:** ${idx.lastCrawlTime}`)
            if (idx.crawledAs) lines.push(`**Crawled as:** ${idx.crawledAs}`)
            if (idx.googleCanonical) lines.push(`**Google canonical:** ${idx.googleCanonical}`)
            if (idx.userCanonical && idx.userCanonical !== idx.googleCanonical)
              lines.push(`**User canonical:** ${idx.userCanonical}`)
            if (idx.sitemap?.length) lines.push(`**In sitemaps:** ${idx.sitemap.join(', ')}`)
            if (idx.referringUrls?.length)
              lines.push(`**Referring URLs:** ${idx.referringUrls.slice(0, 5).join(', ')}`)
          }
          if (r.mobileUsabilityResult) {
            lines.push(`\n**Mobile usability:** ${r.mobileUsabilityResult.verdict ?? 'unknown'}`)
            if (r.mobileUsabilityResult.issues) {
              for (const i of r.mobileUsabilityResult.issues) {
                lines.push(`  - ${i.message ?? i.issueType}`)
              }
            }
          }
          if (r.richResultsResult) {
            lines.push(`\n**Rich results:** ${r.richResultsResult.verdict ?? 'unknown'}`)
            if (r.richResultsResult.detectedItems) {
              for (const i of r.richResultsResult.detectedItems) {
                lines.push(`  - ${i.richResultType}`)
              }
            }
          }
          if (r.inspectionResultLink)
            lines.push(`\n[View in Search Console](${r.inspectionResultLink})`)
          return toolResult(lines.join('\n'))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
