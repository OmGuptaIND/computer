import type { ChatMessage } from '../../lib/store.js'

export interface ToolAction {
  call: ChatMessage
  result: ChatMessage | null
}

export type GroupedItem =
  | { type: 'message'; message: ChatMessage }
  | { type: 'actions'; actions: ToolAction[]; id: string }

/**
 * Groups consecutive tool messages into action blocks.
 * Tool calls (have toolName) are paired with their following result (no toolName).
 */
export function groupMessages(messages: ChatMessage[]): GroupedItem[] {
  const result: GroupedItem[] = []
  let currentActions: ToolAction[] = []
  let pendingCall: ChatMessage | null = null

  function flushActions() {
    if (pendingCall) {
      currentActions.push({ call: pendingCall, result: null })
      pendingCall = null
    }
    if (currentActions.length > 0) {
      result.push({
        type: 'actions',
        actions: currentActions,
        id: `actions_${currentActions[0].call.id}`,
      })
      currentActions = []
    }
  }

  for (const msg of messages) {
    if (msg.role !== 'tool') {
      flushActions()
      result.push({ type: 'message', message: msg })
      continue
    }

    // Tool message with toolName = tool_call
    if (msg.toolName) {
      // If there's already a pending call without a result, push it
      if (pendingCall) {
        currentActions.push({ call: pendingCall, result: null })
      }
      pendingCall = msg
    } else {
      // Tool result — pair with pending call
      if (pendingCall) {
        currentActions.push({ call: pendingCall, result: msg })
        pendingCall = null
      } else {
        // Orphaned result (shouldn't happen normally) — treat as standalone
        currentActions.push({
          call: { ...msg, toolName: 'unknown', content: msg.content },
          result: msg,
        })
      }
    }
  }

  flushActions()
  return result
}
