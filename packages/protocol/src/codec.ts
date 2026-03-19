import type { ChannelId } from './pipes.js'

/**
 * Encode a message into a multiplexed frame.
 *
 * Frame format:
 * [channel: 1 byte] [payload: rest]
 *
 * For binary channels (terminal), payload is raw bytes.
 * For JSON channels (control, AI, events), payload is UTF-8 JSON.
 */
export function encodeFrame(channel: ChannelId, payload: Uint8Array | object): Uint8Array {
  let payloadBytes: Uint8Array

  if (payload instanceof Uint8Array) {
    payloadBytes = payload
  } else {
    const json = JSON.stringify(payload)
    payloadBytes = new TextEncoder().encode(json)
  }

  const frame = new Uint8Array(1 + payloadBytes.length)
  frame[0] = channel
  frame.set(payloadBytes, 1)

  return frame
}

/**
 * Decode a multiplexed frame into channel + payload.
 */
export function decodeFrame(frame: Uint8Array): { channel: ChannelId; payload: Uint8Array } {
  if (frame.length < 1) {
    throw new Error('Frame too short')
  }

  return {
    channel: frame[0] as ChannelId,
    payload: frame.slice(1),
  }
}

/**
 * Parse a JSON payload from a decoded frame.
 */
export function parseJsonPayload<T>(payload: Uint8Array): T {
  const text = new TextDecoder().decode(payload)
  return JSON.parse(text) as T
}
