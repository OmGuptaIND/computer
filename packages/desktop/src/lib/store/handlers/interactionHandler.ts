/**
 * AI channel: confirm, plan_confirm, ask_user, browser_*, tasks_update, done, error, title_update, token_update, compaction.
 */

import type { AiMessage } from '@anton/protocol'
import { useStore } from '../../store.js'
import { artifactStore } from '../artifactStore.js'
import { projectStore } from '../projectStore.js'
import { sessionStore } from '../sessionStore.js'
import type { SessionMeta } from '../types.js'
import { uiStore } from '../uiStore.js'
import type { MessageContext } from './shared.js'

export function handleInteractionMessage(msg: AiMessage, ctx: MessageContext): boolean {
  switch (msg.type) {
    case 'confirm': {
      const sid = ctx.msgSessionId
      if (sid) {
        sessionStore.getState().updateSessionState(sid, {
          pendingConfirm: {
            id: msg.id,
            command: msg.command,
            reason: msg.reason,
            sessionId: sid,
          },
        })
      }
      return true
    }

    case 'plan_confirm': {
      const sid = ctx.msgSessionId
      if (sid) {
        sessionStore.getState().updateSessionState(sid, {
          pendingPlan: {
            id: msg.id,
            title: msg.title,
            content: msg.content,
            sessionId: sid,
          },
        })
      }
      return true
    }

    case 'ask_user': {
      const sid = ctx.msgSessionId
      if (sid) {
        sessionStore.getState().updateSessionState(sid, {
          pendingAskUser: {
            id: msg.id,
            questions: msg.questions,
            sessionId: sid,
          },
        })
      }
      return true
    }

    case 'error': {
      const ss = sessionStore.getState()
      const sid = ctx.msgSessionId

      if (sid && ss.getSessionState(sid).isSyncing) {
        ss.updateSessionState(sid, { isSyncing: false, pendingSyncMessages: [] })
      }

      if (msg.code === 'session_not_found' && sid) {
        const store = useStore.getState()
        const staleConv = store.conversations.find((c) => c.sessionId === sid)
        if (staleConv) {
          store.deleteConversation(staleConv.id)
        }
        return true
      }

      if (sid) {
        ctx.addMsg({
          id: `err_${Date.now()}`,
          role: 'system',
          content: msg.message,
          isError: true,
          timestamp: Date.now(),
        })
        ss.updateSessionState(sid, { isStreaming: false, status: 'error' })
      } else {
        console.warn(
          '[WS] Received error without sessionId, not adding to conversation:',
          msg.message,
        )
      }
      return true
    }

    case 'title_update': {
      if (msg.sessionId) {
        const store = useStore.getState()
        store.updateConversationTitle(msg.sessionId, msg.title)
        const ps = projectStore.getState()
        if (ps.projectSessions.some((s: SessionMeta) => s.id === msg.sessionId)) {
          ps.setProjectSessions(
            ps.projectSessions.map((s: SessionMeta) =>
              s.id === msg.sessionId ? { ...s, title: msg.title } : s,
            ),
          )
        }
      }
      return true
    }

    case 'tasks_update': {
      if (msg.tasks && ctx.msgSessionId) {
        sessionStore.getState().updateSessionState(ctx.msgSessionId, { tasks: msg.tasks })
      }
      return true
    }

    case 'browser_state': {
      if (ctx.isForActiveSession) {
        const as = artifactStore.getState()
        const wasActive = as.browserState?.active
        as.setBrowserState({
          url: msg.url,
          title: msg.title,
          screenshot: msg.screenshot,
          lastAction: msg.lastAction,
          elementCount: msg.elementCount,
        })
        if (!wasActive) {
          uiStore.setState({ sidePanelView: 'browser' })
          artifactStore.setState({ artifactPanelOpen: true })
        }
      }
      return true
    }

    case 'browser_close': {
      if (ctx.isForActiveSession) {
        artifactStore.getState().clearBrowserState()
      }
      return true
    }

    case 'token_update': {
      const sid = ctx.msgSessionId
      if (sid && msg.usage) {
        sessionStore.getState().updateSessionState(sid, { turnUsage: msg.usage })
      }
      return true
    }

    case 'done': {
      const ss = sessionStore.getState()
      const store = useStore.getState()
      const activeConv = store.getActiveConversation()

      const doneConv = ctx.msgSessionId
        ? store.findConversationBySession(ctx.msgSessionId)
        : activeConv
      const doneSessionId = ctx.msgSessionId || activeConv?.sessionId

      const lastMsg = doneConv?.messages[doneConv.messages.length - 1]
      const wasWorking = doneSessionId
        ? ss.getSessionState(doneSessionId).status === 'working'
        : false
      const noResponse = wasWorking && lastMsg?.role === 'user'
      const zeroTokens = msg.usage && msg.usage.inputTokens === 0 && msg.usage.outputTokens === 0

      if (noResponse && zeroTokens) {
        ctx.addMsg({
          id: `err_silent_${Date.now()}`,
          role: 'system',
          content:
            'No response from the agent. The LLM was never called (0 tokens used). Check that a valid API key is configured on the server.',
          isError: true,
          timestamp: Date.now(),
        })
      } else if (noResponse) {
        ctx.addMsg({
          id: `err_empty_${Date.now()}`,
          role: 'system',
          content: 'Agent finished but produced no response.',
          isError: true,
          timestamp: Date.now(),
        })
      }

      if (doneSessionId) {
        // Update all per-session state in one call
        const updates: Partial<import('../sessionStore.js').SessionState> = {
          status: 'idle',
          statusDetail: null,
          isStreaming: false,
          assistantMsgId: null,
          agentSteps: [],
          needsHistoryRefresh: !ctx.isForActiveSession,
        }
        if (msg.usage) {
          updates.turnUsage = msg.usage
          updates.sessionUsage = msg.cumulativeUsage || null
        }
        if (msg.provider && msg.model) {
          updates.lastResponseProvider = msg.provider
          updates.lastResponseModel = msg.model
        }
        ss.updateSessionState(doneSessionId, updates)

        // Clear per-session message tracking in app store
        store._sessionAssistantMsgIds.delete(doneSessionId)
        store._sessionThinkingMsgIds.delete(doneSessionId)
      }

      // Close out pending tool calls that never got a result
      if (doneConv) {
        const resultIds = new Set(
          doneConv.messages.filter((m) => m.id.startsWith('tr_')).map((m) => m.id.slice(3)),
        )
        const pendingCalls = doneConv.messages.filter(
          (m) => m.id.startsWith('tc_') && !resultIds.has(m.id.slice(3)),
        )
        for (const call of pendingCalls) {
          const baseId = call.id.slice(3)
          ctx.addMsg({
            id: `tr_${baseId}`,
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            parentToolCallId: call.parentToolCallId,
          })
        }
      }

      return true
    }

    case 'compaction_start':
      ctx.addMsg({
        id: `compact_${Date.now()}`,
        role: 'system',
        content: 'Compacting context...',
        timestamp: Date.now(),
      })
      return true

    case 'compaction_complete': {
      ctx.addMsg({
        id: `compact_done_${Date.now()}`,
        role: 'system',
        content: `Context compacted: ${msg.compactedMessages} messages summarized (compaction #${msg.totalCompactions})`,
        timestamp: Date.now(),
      })
      return true
    }

    default:
      return false
  }
}
