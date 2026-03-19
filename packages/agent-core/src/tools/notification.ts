/**
 * Notification tool — send desktop notifications.
 * Uses osascript on macOS, notify-send on Linux.
 */

import { execSync } from 'node:child_process'
import { platform } from 'node:os'

export interface NotificationInput {
  title: string
  message: string
  sound?: boolean
}

export function executeNotification(input: NotificationInput): string {
  const { title, message, sound = true } = input
  const os = platform()

  try {
    if (os === 'darwin') {
      const soundClause = sound ? ' sound name "Glass"' : ''
      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"${soundClause}`
      execSync(`osascript -e '${script}'`, { timeout: 5_000 })
    } else {
      // Linux
      const urgency = sound ? '--urgency=normal' : '--urgency=low'
      execSync(
        `notify-send ${urgency} "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`,
        { timeout: 5_000 },
      )
    }
    return `Notification sent: "${title}"`
  } catch (err: unknown) {
    return `Error sending notification: ${(err as Error).message}`
  }
}
