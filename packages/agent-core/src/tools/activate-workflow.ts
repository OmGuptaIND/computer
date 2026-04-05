/**
 * Activate Workflow tool — creates all agents defined in a workflow manifest.
 * Called by the bootstrap agent after the user approves the final configuration.
 * Uses a callback to bridge agent-core → agent-server.
 */

export interface ActivateWorkflowInput {
  workflowId: string
}

export type ActivateWorkflowHandler = (projectId: string, workflowId: string) => Promise<string>
