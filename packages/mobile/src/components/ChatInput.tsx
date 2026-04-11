import { colors, fontSize, radius, spacing } from '@/theme/colors'
import { ChevronUp, Square } from 'lucide-react-native'
import { useCallback, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface Props {
  onSend: (text: string) => void
  onCancel?: () => void
  isWorking?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, onCancel, isWorking, placeholder }: Props) {
  const [text, setText] = useState('')
  const inputRef = useRef<TextInput>(null)
  const insets = useSafeAreaInsets()

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }, [text, onSend])

  const handleCancel = useCallback(() => {
    onCancel?.()
  }, [onCancel])

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder || 'Message Anton...'}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={50000}
          returnKeyType="default"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (!text.includes('\n')) handleSend()
          }}
        />
        {isWorking ? (
          <Pressable
            style={[styles.sendButton, styles.cancelButton]}
            onPress={handleCancel}
            hitSlop={8}
          >
            <Square size={18} strokeWidth={1.5} color={colors.text} fill={colors.text} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
            hitSlop={8}
          >
            <ChevronUp
              size={20}
              strokeWidth={2}
              color={text.trim() ? colors.text : colors.textTertiary}
            />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 0,
    minHeight: 44,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? spacing.xs : spacing.sm,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    marginLeft: spacing.xs,
  },
  sendButtonDisabled: {
    backgroundColor: colors.bgHover,
  },
  cancelButton: {
    backgroundColor: colors.error,
  },
})
