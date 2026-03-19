/**
 * Personalized suggestion engine.
 *
 * Analyzes past conversations to generate contextual "For you" suggestions.
 * Falls back to curated defaults for new users with no history.
 */

import type { Conversation } from './conversations.js'

// ── Topic detection ─────────────────────────────────────────────────

interface TopicPattern {
  keywords: RegExp
  label: string
  suggestions: string[]
}

const TOPIC_PATTERNS: TopicPattern[] = [
  {
    keywords: /deploy|vercel|netlify|coolify|docker|ci\/cd|pipeline|hosting/i,
    label: 'deployment',
    suggestions: [
      'Check deployment status and fix any failing builds',
      'Set up automatic deployment monitoring with notifications',
      'Compare hosting costs and performance across my services',
    ],
  },
  {
    keywords: /api|endpoint|rest|graphql|fetch|request|webhook/i,
    label: 'api',
    suggestions: [
      'Test and document my API endpoints',
      'Build an API health dashboard with uptime tracking',
      'Generate TypeScript types from my API responses',
    ],
  },
  {
    keywords: /react|next|vue|svelte|frontend|component|ui|css|tailwind/i,
    label: 'frontend',
    suggestions: [
      'Audit my components for accessibility issues',
      'Create a design system with consistent tokens and components',
      'Optimize bundle size and loading performance',
    ],
  },
  {
    keywords: /database|sql|postgres|mongo|redis|migration|schema/i,
    label: 'database',
    suggestions: [
      'Analyze my database schema and suggest optimizations',
      'Write migration scripts for the pending schema changes',
      'Set up database backups and monitoring',
    ],
  },
  {
    keywords: /python|script|automat|scrape|data|csv|json|parse/i,
    label: 'automation',
    suggestions: [
      'Build a data pipeline to automate my recurring analysis',
      'Create a web scraper for the sites I track regularly',
      'Automate my daily reports with scheduled scripts',
    ],
  },
  {
    keywords: /git|branch|merge|commit|pr|pull request|review/i,
    label: 'git',
    suggestions: [
      'Review recent commits and summarize what changed this week',
      'Clean up stale branches and check for merge conflicts',
      'Set up git hooks for code quality checks',
    ],
  },
  {
    keywords: /test|spec|jest|vitest|cypress|playwright|coverage/i,
    label: 'testing',
    suggestions: [
      'Identify untested code paths and generate test stubs',
      'Set up end-to-end tests for critical user flows',
      'Fix flaky tests and improve test reliability',
    ],
  },
  {
    keywords: /plan|schedule|task|todo|organize|track|weekly|daily/i,
    label: 'productivity',
    suggestions: [
      'Review my tasks and prioritize for this week',
      'Build a personal dashboard tracking my key metrics',
      'Create a weekly review template and automate reports',
    ],
  },
  {
    keywords: /server|nginx|linux|ssh|systemd|process|monitor/i,
    label: 'devops',
    suggestions: [
      'Check server health — disk, memory, CPU, and running services',
      'Set up log monitoring with alerts for errors',
      'Harden security settings and audit open ports',
    ],
  },
  {
    keywords: /design|figma|mockup|wireframe|layout|landing|page/i,
    label: 'design',
    suggestions: [
      'Build an interactive prototype of the latest design',
      'Create a responsive landing page with modern styling',
      'Generate a style guide from the existing codebase',
    ],
  },
]

// ── Default suggestions for new users ───────────────────────────────

const DEFAULT_SUGGESTIONS = [
  'What can you help me with? Show me something cool.',
  'Check my system — disk space, running processes, and open ports',
  'Help me set up a new project with best practices',
  'Analyze this codebase and summarize the architecture',
  'Build me a personal dashboard as an HTML artifact',
]

// ── Suggestion generation ───────────────────────────────────────────

export interface PersonalizedSuggestion {
  text: string
  source: 'history' | 'topic' | 'default'
}

/**
 * Generate personalized suggestions from conversation history.
 *
 * Strategy:
 * 1. "Continue" suggestions — recent conversations the user might want to follow up on
 * 2. "Topic" suggestions — based on detected patterns in what the user works on
 * 3. "Default" suggestions — curated fallbacks
 *
 * Returns 5 suggestions, mixing sources.
 */
export function generateSuggestions(conversations: Conversation[]): PersonalizedSuggestion[] {
  // No history → all defaults
  if (conversations.length === 0) {
    return DEFAULT_SUGGESTIONS.map((text) => ({ text, source: 'default' }))
  }

  const results: PersonalizedSuggestion[] = []

  // 1. Recent conversation follow-ups (up to 2)
  const recent = conversations
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)

  for (const conv of recent) {
    if (results.length >= 2) break

    const firstUserMsg = conv.messages.find((m) => m.role === 'user')
    if (!firstUserMsg) continue

    const title = conv.title !== 'New conversation' ? conv.title : null
    const prompt = firstUserMsg.content.trim()

    // Skip very short or very long prompts
    if (prompt.length < 10 || prompt.length > 200) continue

    // Generate a follow-up prompt
    const followUp = generateFollowUp(title || prompt, prompt)
    if (followUp && !results.some((r) => r.text === followUp)) {
      results.push({ text: followUp, source: 'history' })
    }
  }

  // 2. Topic-based suggestions (up to 2)
  const allText = conversations
    .slice(0, 20) // Look at last 20 conversations
    .flatMap((c) => c.messages.filter((m) => m.role === 'user').map((m) => m.content))
    .join(' ')

  const detectedTopics = TOPIC_PATTERNS.filter((p) => p.keywords.test(allText))
  const usedSuggestions = new Set(results.map((r) => r.text))

  for (const topic of detectedTopics) {
    if (results.length >= 4) break
    // Pick a random suggestion from this topic that hasn't been used
    const available = topic.suggestions.filter((s) => !usedSuggestions.has(s))
    if (available.length > 0) {
      const pick = available[Math.floor(Math.random() * available.length)]
      results.push({ text: pick, source: 'topic' })
      usedSuggestions.add(pick)
    }
  }

  // 3. Fill remaining with defaults
  for (const text of DEFAULT_SUGGESTIONS) {
    if (results.length >= 5) break
    if (!usedSuggestions.has(text)) {
      results.push({ text, source: 'default' })
      usedSuggestions.add(text)
    }
  }

  return results.slice(0, 5)
}

// ── Follow-up generation ────────────────────────────────────────────

function generateFollowUp(title: string, originalPrompt: string): string | null {
  const lower = originalPrompt.toLowerCase()

  // If the original was about building something, suggest continuing
  if (/^(build|create|make|set up|implement|design)/i.test(lower)) {
    return `Continue working on: ${title}`
  }

  // If it was about fixing/debugging
  if (/^(fix|debug|solve|investigate|troubleshoot)/i.test(lower)) {
    return `Check if the fix for "${title}" is still working`
  }

  // If it was about analysis/review
  if (/^(analyze|review|check|audit|inspect|monitor)/i.test(lower)) {
    return `Run another check on: ${title}`
  }

  // If it was about deployment
  if (/deploy|release|ship|publish/i.test(lower)) {
    return `Check deployment status for: ${title}`
  }

  // Generic follow-up
  if (title.length <= 50) {
    return `Continue: ${title}`
  }

  return null
}
