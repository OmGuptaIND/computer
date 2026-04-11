import { AskUserSheet } from '@/components/AskUserSheet'
import { ChatInput } from '@/components/ChatInput'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { ConversationList } from '@/components/ConversationList'
import { MessageBubble } from '@/components/MessageBubble'
import { PlanReviewSheet } from '@/components/PlanReviewSheet'
import { StatusIndicator } from '@/components/StatusIndicator'
import { TaskChecklist } from '@/components/TaskChecklist'
import { useStore } from '@/lib/store'
import { connectionStore } from '@/lib/store/connectionStore'
import { sessionStore, useActiveSessionState } from '@/lib/store/sessionStore'
import type { ChatMessage } from '@/lib/store/types'
import { colors, fontSize, spacing } from '@/theme/colors'
import { List, Plus } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList>(null)
  const [showConversations, setShowConversations] = useState(false)

  const conversations = useStore((s) => s.conversations)
  const activeConversationId = useStore((s) => s.activeConversationId)
  const activeConv = useStore((s) => s.getActiveConversation())
  const messages = activeConv?.messages ?? []
  const initPhase = connectionStore((s) => s.initPhase)

  const agentStatus = useActiveSessionState((s) => s.status)
  const statusDetail = useActiveSessionState((s) => s.statusDetail)
  const tasks = useActiveSessionState((s) => s.tasks)
  const pendingConfirm = useActiveSessionState((s) => s.pendingConfirm)
  const pendingPlan = useActiveSessionState((s) => s.pendingPlan)
  const pendingAskUser = useActiveSessionState((s) => s.pendingAskUser)

  // Auto-create conversation on first load
  useEffect(() => {
    if (initPhase === 'ready' && !activeConversationId) {
      useStore.getState().newConversation()
    }
  }, [initPhase, activeConversationId])

  // Fetch history when switching conversations
  const activeSessionId = activeConv?.sessionId
  const hasMessages = (activeConv?.messages.length ?? 0) > 0
  useEffect(() => {
    if (activeSessionId && !hasMessages && initPhase === 'ready') {
      useStore.getState().requestSessionHistory(activeSessionId)
    }
  }, [activeSessionId, hasMessages, initPhase])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [messages.length])

  const handleSend = useCallback(
    (text: string) => {
      const store = useStore.getState()
      const ss = sessionStore.getState()
      let conv = store.getActiveConversation()

      // Create conversation if needed
      if (!conv) {
        const id = store.newConversation()
        conv = store.conversations.find((c) => c.id === id)!
      }

      // Ensure session is created
      if (conv.sessionId && !ss.currentSessionId) {
        ss.createSession(conv.sessionId, {
          provider: ss.currentProvider,
          model: ss.currentModel,
          projectId: conv.projectId,
        })
      }

      // Add user message locally
      store.addMessage({
        id: `user_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      })

      // Send to server
      const sessionId = conv.sessionId
      if (agentStatus === 'working' && sessionId) {
        ss.sendSteerMessage(text, sessionId)
      } else if (sessionId) {
        ss.sendAiMessageToSession(text, sessionId)
      } else {
        ss.sendAiMessage(text)
      }
    },
    [agentStatus],
  )

  const handleCancel = useCallback(() => {
    const sid = sessionStore.getState().currentSessionId
    if (sid) sessionStore.getState().sendCancelTurn(sid)
  }, [])

  const handleNewConversation = useCallback(() => {
    useStore.getState().newConversation()
  }, [])

  const handleConfirmApprove = useCallback(() => {
    if (pendingConfirm) {
      sessionStore.getState().sendConfirmResponse(pendingConfirm.id, true)
      const sid = pendingConfirm.sessionId || sessionStore.getState().currentSessionId
      if (sid) {
        sessionStore.getState().updateSessionState(sid, { pendingConfirm: null })
      }
    }
  }, [pendingConfirm])

  const handleConfirmDeny = useCallback(() => {
    if (pendingConfirm) {
      sessionStore.getState().sendConfirmResponse(pendingConfirm.id, false)
      const sid = pendingConfirm.sessionId || sessionStore.getState().currentSessionId
      if (sid) {
        sessionStore.getState().updateSessionState(sid, { pendingConfirm: null })
      }
    }
  }, [pendingConfirm])

  const handlePlanApprove = useCallback(() => {
    if (pendingPlan) {
      sessionStore.getState().sendPlanResponse(pendingPlan.id, true)
      const sid = pendingPlan.sessionId || sessionStore.getState().currentSessionId
      if (sid) {
        sessionStore.getState().updateSessionState(sid, { pendingPlan: null })
      }
    }
  }, [pendingPlan])

  const handlePlanDeny = useCallback(
    (feedback?: string) => {
      if (pendingPlan) {
        sessionStore.getState().sendPlanResponse(pendingPlan.id, false, feedback)
        const sid = pendingPlan.sessionId || sessionStore.getState().currentSessionId
        if (sid) {
          sessionStore.getState().updateSessionState(sid, { pendingPlan: null })
        }
      }
    },
    [pendingPlan],
  )

  const handleAskUserSubmit = useCallback(
    (answers: Record<string, string>) => {
      if (pendingAskUser) {
        sessionStore.getState().sendAskUserResponse(pendingAskUser.id, answers)
        const sid = pendingAskUser.sessionId || sessionStore.getState().currentSessionId
        if (sid) {
          sessionStore.getState().updateSessionState(sid, { pendingAskUser: null })
        }
      }
    },
    [pendingAskUser],
  )

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const next = messages[index + 1]
      const isLastInGroup = !next || next.role !== item.role
      return <MessageBubble message={item} isLastInGroup={isLastInGroup} />
    },
    [messages],
  )

  const title = activeConv?.title || 'New Chat'

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => setShowConversations(true)}>
          <List size={18} strokeWidth={1.5} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <StatusIndicator status={agentStatus} detail={statusDetail} />
        </View>
        <Pressable style={styles.headerBtn} onPress={handleNewConversation}>
          <Plus size={18} strokeWidth={1.5} color={colors.text} />
        </Pressable>
      </View>

      {/* Tasks */}
      <TaskChecklist tasks={tasks} />

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onEndReached={() => {}}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptySubtitle}>
              Ask Anton to do anything — write code, scrape data, deploy apps, and more.
            </Text>
          </View>
        }
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onCancel={handleCancel}
        isWorking={agentStatus === 'working'}
      />

      {/* Interaction sheets */}
      {pendingConfirm && (
        <ConfirmSheet
          confirm={pendingConfirm}
          onApprove={handleConfirmApprove}
          onDeny={handleConfirmDeny}
        />
      )}
      {pendingPlan && (
        <PlanReviewSheet plan={pendingPlan} onApprove={handlePlanApprove} onDeny={handlePlanDeny} />
      )}
      {pendingAskUser && <AskUserSheet askUser={pendingAskUser} onSubmit={handleAskUserSubmit} />}

      {/* Conversation drawer */}
      <Modal visible={showConversations} animationType="slide">
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
          <ConversationList
            conversations={conversations.filter((c) => !c.projectId)}
            activeId={activeConversationId}
            onSelect={(id) => useStore.getState().switchConversation(id)}
            onDelete={(id) => useStore.getState().deleteConversation(id)}
            onClose={() => setShowConversations(false)}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    maxWidth: 200,
  },
  messageList: {
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingTop: 100,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textTertiary,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
})
