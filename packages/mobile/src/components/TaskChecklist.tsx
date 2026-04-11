import { colors, fontSize, radius, spacing } from '@/theme/colors'
import type { TaskItem } from '@anton/protocol'
import { Check, Circle, Loader } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'

interface Props {
  tasks: TaskItem[]
}

export function TaskChecklist({ tasks }: Props) {
  if (tasks.length === 0) return null

  return (
    <View style={styles.container}>
      {tasks.map((task) => (
        <View key={task.content} style={styles.taskRow}>
          {task.status === 'completed' ? (
            <Check size={14} strokeWidth={1.5} color={colors.success} />
          ) : task.status === 'in_progress' ? (
            <Loader size={14} strokeWidth={1.5} color={colors.working} />
          ) : (
            <Circle size={14} strokeWidth={1.5} color={colors.textTertiary} />
          )}
          <Text
            style={[
              styles.taskText,
              task.status === 'completed' && styles.taskCompleted,
              task.status === 'in_progress' && styles.taskActive,
            ]}
            numberOfLines={2}
          >
            {task.status === 'in_progress' ? task.activeForm : task.content}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  taskText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    flex: 1,
  },
  taskCompleted: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  taskActive: {
    color: colors.text,
  },
})
