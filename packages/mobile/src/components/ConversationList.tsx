import type { Conversation } from '@/lib/store/types'
import { colors, fontSize, radius, spacing } from '@/theme/colors'
import { MessageSquare, Trash2 } from 'lucide-react-native'
import { useCallback } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export function ConversationList({ conversations, activeId, onSelect, onDelete, onClose }: Props) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const isActive = item.id === activeId
      const lastMsg = item.messages[item.messages.length - 1]
      const preview = lastMsg ? lastMsg.content.slice(0, 80).replace(/\n/g, ' ') : 'No messages yet'

      return (
        <Pressable
          style={[styles.item, isActive && styles.itemActive]}
          onPress={() => {
            onSelect(item.id)
            onClose()
          }}
        >
          <View style={styles.itemContent}>
            <View style={styles.itemHeader}>
              <Text
                style={[styles.itemTitle, isActive && styles.itemTitleActive]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Text style={styles.itemTime}>{timeAgo(item.updatedAt)}</Text>
            </View>
            <Text style={styles.itemPreview} numberOfLines={1}>
              {preview}
            </Text>
          </View>
          <Pressable style={styles.deleteBtn} onPress={() => onDelete(item.id)} hitSlop={8}>
            <Trash2 size={14} strokeWidth={1.5} color={colors.textTertiary} />
          </Pressable>
        </Pressable>
      )
    },
    [activeId, onSelect, onDelete, onClose],
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MessageSquare size={32} strokeWidth={1.5} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No conversations yet</Text>
          </View>
        }
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  doneText: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  list: {
    paddingVertical: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  itemActive: {
    backgroundColor: colors.surfaceActive,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  itemTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    flex: 1,
    marginRight: spacing.sm,
  },
  itemTitleActive: {
    color: colors.accentText,
  },
  itemTime: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
  },
  itemPreview: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
  },
  deleteBtn: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: fontSize.md,
  },
})
