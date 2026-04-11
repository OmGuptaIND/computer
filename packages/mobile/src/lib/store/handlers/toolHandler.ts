/**
 * AI channel: tool_call, tool_result, artifact messages.
 */

import type { AiMessage } from '@anton/protocol'
import { useStore } from '../../store'
import { sessionStore } from '../sessionStore'
import type { MessageContext } from './shared'

export function handleToolMessage(msg: AiMessage, ctx: MessageContext): boolean {
  switch (msg.type) {
    case 'tool_call': {
      const ss = sessionStore.getState()
      const sid = ctx.msgSessionId || useStore.getState().getActiveConversation()?.sessionId
      const uiOnlyTools = new Set(['ask_user', 'task_tracker', 'plan_confirm'])

      if (uiOnlyTools.has(msg.name)) {
        if (sid) {
          const state = ss.getSessionState(sid)
          const hiddenIds = new Set(state.hiddenToolCallIds)
          hiddenIds.add(msg.id)
          ss.updateSessionState(sid, { hiddenToolCallIds: hiddenIds })
        }
        if (sid) ss.setSessionStatus(sid, 'working')
        return true
      }

      if (!msg.parentToolCallId && sid) {
        useStore.getState()._sessionAssistantMsgIds.delete(sid)
      }

      if (sid) {
        const state = ss.getSessionState(sid)
        const names = new Map(state.toolCallNames)
        names.set(msg.id, { name: msg.name, input: msg.input })
        ss.updateSessionState(sid, { toolCallNames: names })
      }

      ctx.addMsg({
        id: `tc_${msg.id}`,
        role: 'tool',
        content: `Running: ${msg.name}`,
        toolName: msg.name,
        toolInput: msg.input,
        timestamp: Date.now(),
        parentToolCallId: msg.parentToolCallId,
      })

      if (!msg.parentToolCallId && sid) {
        ss.addAgentStep(sid, {
          id: msg.id,
          type: 'tool_call',
          label: `Running: ${msg.name}`,
          toolName: msg.name,
          status: 'active',
          timestamp: Date.now(),
        })
      }

      if (sid) ss.setSessionStatus(sid, 'working')
      return true
    }

    case 'tool_result': {
      const ss = sessionStore.getState()
      const sid = ctx.msgSessionId || useStore.getState().getActiveConversation()?.sessionId

      if (sid) {
        const state = ss.getSessionState(sid)
        if (state.hiddenToolCallIds.has(msg.id)) {
          const hiddenIds = new Set(state.hiddenToolCallIds)
          hiddenIds.delete(msg.id)
          ss.updateSessionState(sid, { hiddenToolCallIds: hiddenIds })
          return true
        }
      }

      let callInfo: { name: string; input?: Record<string, unknown> } | undefined
      if (sid) {
        const state = ss.getSessionState(sid)
        callInfo = state.toolCallNames.get(msg.id)
        if (callInfo) {
          const names = new Map(state.toolCallNames)
          names.delete(msg.id)
          ss.updateSessionState(sid, { toolCallNames: names })
        }
      }

      ctx.addMsg({
        id: `tr_${msg.id}`,
        role: 'tool',
        content: msg.output,
        isError: msg.isError,
        timestamp: Date.now(),
        parentToolCallId: msg.parentToolCallId,
        ...(callInfo && { toolName: callInfo.name, toolInput: callInfo.input }),
      })

      if (!msg.parentToolCallId && sid) {
        ss.updateAgentStep(sid, msg.id, { status: msg.isError ? 'error' : 'complete' })
      }
      return true
    }

    case 'artifact':
      // For MVP, we just show artifacts as tool messages
      return true

    default:
      return false
  }
}
