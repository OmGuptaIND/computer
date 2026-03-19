/** Pipe channel IDs for multiplexed WebSocket communication. */
export const Channel = {
  CONTROL: 0x00,
  TERMINAL: 0x01,
  AI: 0x02,
  FILESYNC: 0x03,
  EVENTS: 0x04,
} as const

export type ChannelId = (typeof Channel)[keyof typeof Channel]
