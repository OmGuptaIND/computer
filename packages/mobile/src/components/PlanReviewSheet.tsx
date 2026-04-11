import type { PendingPlan } from '@/lib/store/types'
import { colors, fontSize, radius, spacing } from '@/theme/colors'
import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

interface Props {
  plan: PendingPlan
  onApprove: () => void
  onDeny: (feedback?: string) => void
}

export function PlanReviewSheet({ plan, onApprove, onDeny }: Props) {
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)

  return (
    <Modal transparent animationType="slide" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{plan.title || 'Review Plan'}</Text>

          <ScrollView style={styles.scroll}>
            <Text style={styles.content} selectable>
              {plan.content}
            </Text>
          </ScrollView>

          {showFeedback && (
            <TextInput
              style={styles.feedbackInput}
              value={feedback}
              onChangeText={setFeedback}
              placeholder="What should change?"
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus
            />
          )}

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.denyButton]}
              onPress={() => {
                if (showFeedback) {
                  onDeny(feedback || undefined)
                } else {
                  setShowFeedback(true)
                }
              }}
            >
              <Text style={styles.denyText}>
                {showFeedback ? 'Send Feedback' : 'Request Changes'}
              </Text>
            </Pressable>
            <Pressable style={[styles.button, styles.approveButton]} onPress={onApprove}>
              <Text style={styles.approveText}>Approve</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    paddingBottom: spacing.xxxl,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  scroll: {
    marginBottom: spacing.lg,
    maxHeight: 300,
  },
  content: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 24,
  },
  feedbackInput: {
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.md,
    padding: spacing.md,
    minHeight: 60,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  denyButton: {
    backgroundColor: colors.bgTertiary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  approveButton: {
    backgroundColor: colors.accent,
  },
  denyText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  approveText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
})
