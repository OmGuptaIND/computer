/**
 * `anton chat "message"` — one-shot: send message, stream response, exit.
 */

import { Channel } from '@anton/protocol'
import type { AiConfirmMessage, AiMessage } from '@anton/protocol'
import { Connection } from '../lib/connection.js'
import { getDefaultMachine } from '../lib/machines.js'
import { ICONS, theme } from '../lib/theme.js'

export async function chatCommand(message: string): Promise<void> {
  const machine = getDefaultMachine()

  if (!machine) {
    console.error(`No machine configured. Run ${theme.bold('anton connect <host>')} first.`)
    process.exit(1)
  }

  const conn = new Connection()

  try {
    await conn.connect({
      host: machine.host,
      port: machine.port,
      token: machine.token,
      useTLS: machine.useTLS,
    })
  } catch (err: unknown) {
    console.error(`${theme.error('Connection failed:')} ${(err as Error).message}`)
    process.exit(1)
  }

  return new Promise<void>((resolve) => {
    conn.onMessage((channel, payload) => {
      if (channel === Channel.AI) {
        const msg = payload as AiMessage
        switch (msg.type) {
          case 'text':
            process.stdout.write(msg.content)
            break
          case 'tool_call':
            console.log(
              `\n${ICONS.tool} ${theme.toolName(msg.name)} ${theme.dim(JSON.stringify(msg.input).slice(0, 80))}`,
            )
            break
          case 'tool_result':
            if (msg.isError) {
              console.log(`${ICONS.toolError} ${theme.error(msg.output)}`)
            } else {
              console.log(`${ICONS.toolDone} ${theme.dim(msg.output.slice(0, 120))}`)
            }
            break
          case 'error':
            console.error(`\n${theme.error('Error:')} ${msg.message}`)
            break
          case 'done':
            process.stdout.write('\n')
            conn.disconnect()
            resolve()
            break
        }
      }
    })

    // Auto-approve confirmations in one-shot mode
    conn.onMessage((channel, payload) => {
      if (channel === Channel.AI && (payload as AiMessage).type === 'confirm') {
        const confirm = payload as AiConfirmMessage
        console.log(`${ICONS.confirm} Auto-approved: ${confirm.command}`)
        conn.sendConfirmResponse(confirm.id, true)
      }
    })

    conn.sendAiMessage(message)
  })
}
