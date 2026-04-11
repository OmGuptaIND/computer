import type { AiMessage } from '@anton/protocol'
import type { ChatMessage } from '../types'

export interface MessageContext {
  msgSessionId: string | undefined
  isForActiveSession: boolean
  addMsg: (msg: ChatMessage) => void
  appendText: (content: string) => void
  appendThinking: (content: string) => void
  msg: AiMessage
}
