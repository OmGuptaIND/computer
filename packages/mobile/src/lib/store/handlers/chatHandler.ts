/**
 * AI channel: text, thinking, steer_ack, sub_agent_* messages.
 */

import type { AiMessage } from '@anton/protocol'
import { useStore } from '../../store'
import { sessionStore } from '../sessionStore'
import type { MessageContext } from './shared'

export function handleChatMessage(msg: AiMessage, ctx: MessageContext): boolean {
  switch (msg.type) {
    case 'steer_ack': {
      ctx.addMsg({
        id: `steer_${Date.now()}`,
        role: 'user',
        content: msg.content,
        timestamp: Date.now(),
        isSteering: true,
      })
      return true
    }

    case 'text': {
      const textContent = msg.content ?? ''
      if (!textContent) return true
      const textSessionId =
        ctx.msgSessionId || useStore.getState().getActiveConversation()?.sessionId
      if (textSessionId) {
        const ss = sessionStore.getState()
        if (!ss.getSessionState(textSessionId).isStreaming) {
          ss.updateSessionState(textSessionId, { isStreaming: true })
        }
      }
      if (textSessionId) {
        useStore.getState()._sessionThinkingMsgIds.delete(textSessionId)
      }
      ctx.appendText(textContent)
      return true
    }

    case 'thinking': {
      const thinkContent = msg.text ?? ''
      if (thinkContent) {
        ctx.appendThinking(thinkContent)
      }
      const sid = ctx.msgSessionId || useStore.getState().getActiveConversation()?.sessionId
      if (sid) {
        sessionStore.getState().setSessionStatus(sid, 'working')
      }
      return true
    }

    case 'text_replace': {
      if (msg.remove) {
        useStore.getState().replaceAssistantText(msg.remove, '', ctx.msgSessionId)
      }
      return true
    }

    case 'sub_agent_start': {
      ctx.addMsg({
        id: `sa_start_${msg.toolCallId}`,
        role: 'tool',
        content: msg.task,
        toolName: 'sub_agent',
        toolInput: { task: msg.task },
        timestamp: Date.now(),
      })
      return true
    }

    case 'sub_agent_end': {
      ctx.addMsg({
        id: `sa_end_${msg.toolCallId}`,
        role: 'tool',
        content: msg.success ? 'Sub-agent completed' : 'Sub-agent failed',
        isError: !msg.success,
        timestamp: Date.now(),
        parentToolCallId: msg.toolCallId,
      })
      return true
    }

    case 'sub_agent_progress': {
      const store = useStore.getState()
      if (ctx.isForActiveSession) {
        store.appendSubAgentProgress(msg.toolCallId, msg.content, msg.toolCallId)
      } else if (ctx.msgSessionId) {
        store.appendSubAgentProgressToSession(
          ctx.msgSessionId,
          msg.toolCallId,
          msg.content,
          msg.toolCallId,
        )
      }
      return true
    }

    default:
      return false
  }
}
