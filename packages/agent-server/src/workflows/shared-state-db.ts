/**
 * Workflow Shared State DB — per-workflow SQLite database for agent coordination.
 *
 * Each workflow gets its own `state/shared.db`. Agents read/write through the
 * `shared_state` tool. The system enforces valid status transitions per agent.
 */

import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createLogger } from '@anton/logger'
import Database from 'better-sqlite3'

const log = createLogger('shared-state-db')

interface TransitionRule {
  from: string | null
  to: string
}

export class WorkflowStateDb {
  private db: Database.Database
  private transitions: Record<string, TransitionRule>

  constructor(dbPath: string, transitions: Record<string, TransitionRule>) {
    // Ensure directory exists
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL') // Better concurrent access
    this.db.pragma('foreign_keys = ON')
    this.transitions = transitions
  }

  /** Run setup SQL (CREATE TABLE statements) */
  setup(setupSql: string): void {
    // Split by semicolons and run each statement
    const statements = setupSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const stmt of statements) {
      this.db.exec(stmt)
    }
    log.info('Shared state DB initialized')
  }

  /** Run a SELECT query, return results as JSON */
  query(sql: string, params: unknown[] = []): string {
    const trimmed = sql.trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA')) {
      return JSON.stringify({
        error:
          'query operation only supports SELECT statements. Use "execute" for INSERT/UPDATE/DELETE.',
      })
    }

    try {
      const stmt = this.db.prepare(sql)
      const rows = stmt.all(...params)
      return JSON.stringify({ rows, count: rows.length })
    } catch (err) {
      return JSON.stringify({
        error: `Query failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  /** Run an INSERT/UPDATE/DELETE, enforce transitions, return changes count */
  execute(sql: string, params: unknown[] = [], agentKey?: string): string {
    const trimmed = sql.trim().toUpperCase()
    if (trimmed.startsWith('SELECT')) {
      return JSON.stringify({
        error: 'execute operation does not support SELECT. Use "query" instead.',
      })
    }

    // Block dangerous operations
    if (trimmed.startsWith('DROP') || trimmed.startsWith('ALTER') || trimmed.startsWith('CREATE')) {
      return JSON.stringify({
        error: 'Schema modifications are not allowed. Only INSERT/UPDATE/DELETE.',
      })
    }

    try {
      // Check for status transition enforcement
      if (agentKey && trimmed.includes('STATUS')) {
        const violation = this.checkTransition(sql, agentKey)
        if (violation) {
          this.logTransition(null, agentKey, null, null, `REJECTED: ${violation}`)
          return JSON.stringify({ error: violation })
        }
      }

      const stmt = this.db.prepare(sql)
      const result = stmt.run(...params)

      // Auto-log transitions for UPDATE statements that change status
      if (agentKey && trimmed.startsWith('UPDATE') && trimmed.includes('STATUS')) {
        const rule = this.transitions[agentKey]
        if (rule) {
          this.logTransition(null, agentKey, rule.from, rule.to, 'OK')
        }
      }

      return JSON.stringify({
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid?.toString(),
      })
    } catch (err) {
      return JSON.stringify({
        error: `Execute failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  /** Check if an agent's status transition is allowed */
  private checkTransition(sql: string, agentKey: string): string | null {
    const rule = this.transitions[agentKey]
    if (!rule) {
      return `Agent "${agentKey}" has no defined transitions. It cannot modify status.`
    }

    // Extract the target status from SET status = '...' pattern
    const setMatch = sql.match(/SET\s+.*?status\s*=\s*'([^']+)'/i)
    if (setMatch) {
      const targetStatus = setMatch[1]
      if (targetStatus !== rule.to) {
        return `Agent "${agentKey}" can only set status to "${rule.to}", but tried to set "${targetStatus}".`
      }
    }

    // For INSERT, check the agent is allowed to create new items (from: null)
    const trimmed = sql.trim().toUpperCase()
    if (trimmed.startsWith('INSERT') && rule.from !== null) {
      return `Agent "${agentKey}" cannot INSERT new items. It can only process items with status "${rule.from}".`
    }

    return null
  }

  /** Log a state transition for audit trail */
  private logTransition(
    leadId: number | null,
    agent: string,
    fromStatus: string | null,
    toStatus: string | null,
    message: string,
  ): void {
    try {
      this.db
        .prepare(
          'INSERT INTO state_log (lead_id, agent, from_status, to_status, message) VALUES (?, ?, ?, ?, ?)',
        )
        .run(leadId, agent, fromStatus, toStatus, message)
    } catch {
      // Don't fail the main operation if logging fails
    }
  }

  /** Close the database connection */
  close(): void {
    this.db.close()
  }
}
