import type { PendingConfirm } from '@/lib/store/types'
import { colors, fontSize, radius, spacing } from '@/theme/colors'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

interface Props {
  confirm: PendingConfirm
  onApprove: () => void
  onDeny: () => void
}

export function ConfirmSheet({ confirm, onApprove, onDeny }: Props) {
  return (
    <Modal transparent animationType="slide" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Confirm Action</Text>
          <Text style={styles.reason}>{confirm.reason}</Text>

          <ScrollView style={styles.commandScroll} horizontal>
            <View style={styles.commandBox}>
              <Text style={styles.command}>{confirm.command}</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.denyButton]} onPress={onDeny}>
              <Text style={styles.denyText}>Deny</Text>
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
    marginBottom: spacing.sm,
  },
  reason: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  commandScroll: {
    marginBottom: spacing.xl,
  },
  commandBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  command: {
    color: colors.accentText,
    fontSize: fontSize.sm,
    fontFamily: 'Courier',
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
