/**
 * CONTROL channel: auth, config, ping/pong.
 */

import type { ControlMessage } from '@anton/protocol'
import { connection } from '../../connection'
import { connectionStore } from '../connectionStore'

export function handleControlMessage(msg: ControlMessage): void {
  switch (msg.type) {
    case 'auth_ok': {
      connectionStore.getState().startSyncing()

      // Fire all sync requests in parallel
      connection.sendProvidersList()
      connection.sendSessionsSync(0)
      connection.sendProjectsList()
      connection.sendConnectorsList()
      break
    }

    case 'ping':
      connection.send(0, { type: 'pong' })
      break

    case 'config_query_response':
      break

    default:
      break
  }
}
