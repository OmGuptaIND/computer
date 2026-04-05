/**
 * Shared State tool — gives workflow agents access to a per-workflow SQLite database.
 * Agents coordinate through this DB instead of files or external connectors.
 * The server enforces valid status transitions per agent.
 */

export type SharedStateHandler = (
  projectId: string,
  workflowId: string,
  operation: 'query' | 'execute',
  sql: string,
  params?: unknown[],
) => Promise<string>
