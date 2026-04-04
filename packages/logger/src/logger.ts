/**
 * Structured logger for the Anton agent stack.
 *
 * Thin wrapper over pino. Four functions, that's the entire API:
 *   initLogger()           — call once at startup
 *   createLogger(name)     — module-level logger (replaces bracket prefixes)
 *   withContext(log, ctx)  — bind session/agent context
 *   getRootLogger()        — escape hatch
 *
 * Dev:  pretty-printed via pino-pretty
 * Prod: JSON to stdout (pipe wherever you want)
 *
 * Env vars:
 *   LOG_LEVEL        — debug | info | warn | error (default: info)
 *   ANTON_JSON_LOGS  — set to "1" to force JSON even in dev
 */

import pino from 'pino'

export interface LoggerOptions {
  level?: string
  pretty?: boolean
}

export interface LogContext {
  sessionId?: string
  agentName?: string
  [key: string]: unknown
}

export type Logger = pino.Logger

// ── Singleton ───────────────────────────────────────────────────────

let root: pino.Logger | null = null

/**
 * Initialize the root logger. Call once at startup before any logging.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initLogger(opts?: LoggerOptions): void {
  if (root) return

  const level = opts?.level || process.env.LOG_LEVEL || 'info'
  const wantPretty =
    opts?.pretty ?? (process.env.ANTON_JSON_LOGS !== '1' && process.stdout.isTTY === true)

  const transport = wantPretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '({module}) {msg}',
        },
      }
    : undefined

  root = pino({
    level,
    transport,
    formatters: {
      level(label) {
        return { level: label }
      },
    },
    // Skip pid/hostname in JSON output — we're a single-process agent, not a fleet
    base: undefined,
  })
}

/**
 * Get the root pino instance. Auto-initializes with defaults if
 * called before initLogger() — prevents crashes from import-time logging.
 */
export function getRootLogger(): pino.Logger {
  if (!root) initLogger()
  return root!
}

/**
 * Create a named child logger for a module.
 * Replaces the old `console.log('[mcp-manager] ...')` pattern.
 *
 * Usage:
 *   const log = createLogger('mcp-manager')
 *   log.info({ count: 3 }, 'starting connectors')
 */
export function createLogger(name: string): pino.Logger {
  return getRootLogger().child({ module: name })
}

/**
 * Bind runtime context (session ID, agent name, etc.) to a logger.
 * Returns a new child — never mutates the original. Safe for concurrent sessions.
 *
 * Usage:
 *   const sessionLog = withContext(log, { sessionId: 'abc', agentName: 'research' })
 *   sessionLog.info('turn started')  // { module: "session", sessionId: "abc", ... }
 */
export function withContext(logger: pino.Logger, ctx: LogContext): pino.Logger {
  return logger.child(ctx)
}
