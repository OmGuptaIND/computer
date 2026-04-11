import type { AgentStatus } from '@/lib/store/types'
import { colors, fontSize, spacing } from '@/theme/colors'
import { StyleSheet, Text, View } from 'react-native'

interface Props {
  status: AgentStatus
  detail?: string | null
}

export function StatusIndicator({ status, detail }: Props) {
  if (status === 'idle') return null

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.dot,
          status === 'working' && styles.dotWorking,
          status === 'error' && styles.dotError,
        ]}
      />
      <Text style={styles.text} numberOfLines={1}>
        {status === 'working' ? detail || 'Working...' : 'Error'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotWorking: {
    backgroundColor: colors.working,
  },
  dotError: {
    backgroundColor: colors.error,
  },
  text: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    flex: 1,
  },
})
