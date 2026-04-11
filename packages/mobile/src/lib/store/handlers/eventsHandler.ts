/**
 * EVENTS channel: agent_status, update_available, etc.
 */

import type { EventMessage } from '@anton/protocol'
import { sessionStore } from '../sessionStore'

export function handleEventsMessage(msg: EventMessage): void {
  switch (msg.type) {
    case 'agent_status': {
      const status = msg.status === 'working' ? 'working' : 'idle'
      if (msg.sessionId) {
        sessionStore.getState().setSessionStatus(msg.sessionId, status, msg.detail)
      }
      break
    }

    default:
      break
  }
}
