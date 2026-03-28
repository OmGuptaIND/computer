/**
 * Deliver result tool — lets an agent send results back to the conversation that created it.
 *
 * The agent decides when and what to deliver. It calls this tool with a summary
 * of its findings, and the server appends that as a message to the origin conversation.
 */

export type DeliverResultHandler = (result: {
  content: string
  summary?: string // short one-liner for notifications
}) => Promise<string>
