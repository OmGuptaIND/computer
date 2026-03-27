/**
 * Notification persistence — append-only JSONL files per project.
 *
 * Storage: ~/.anton/projects/{projectId}/notifications/feed.jsonl
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAntonDir } from '@anton/agent-config'
import type { ProjectNotification } from '@anton/protocol'

function getNotificationsDir(projectId: string): string {
  return join(getAntonDir(), 'projects', projectId, 'notifications')
}

function getFeedPath(projectId: string): string {
  return join(getNotificationsDir(projectId), 'feed.jsonl')
}

export function appendNotification(projectId: string, notification: ProjectNotification): void {
  const dir = getNotificationsDir(projectId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const line = `${JSON.stringify(notification)}\n`
  appendFileSync(getFeedPath(projectId), line)
}

export function loadNotifications(projectId: string, limit = 50): ProjectNotification[] {
  const feedPath = getFeedPath(projectId)
  if (!existsSync(feedPath)) return []

  const content = readFileSync(feedPath, 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)

  // Return most recent notifications (last N lines)
  const recent = lines.slice(-limit)
  const notifications: ProjectNotification[] = []

  for (const line of recent) {
    try {
      notifications.push(JSON.parse(line))
    } catch {
      // Skip malformed lines
    }
  }

  return notifications
}
