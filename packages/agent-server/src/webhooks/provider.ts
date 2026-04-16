/**
 * WebhookProvider — pluggable interface for inbound bot integrations.
 *
 * Each provider (Slack, Telegram, GitHub, Linear, Discord, …) implements
 * this interface and is mounted under a single canonical URL:
 *
 *   POST /_anton/webhooks/{slug}
 *
 * The router (see ./router.ts) handles HTTP plumbing, signature verification,
 * de-duplication, and dispatching to the shared agent runner. Providers stay
 * thin — typically ~80 lines — and only contain provider-specific concerns:
 *   - signature/secret verification
 *   - challenge/handshake replies
 *   - parsing the raw payload into 0..N CanonicalEvents
 *   - sending replies back to the source
 */

export interface WebhookRequest {
  rawBody: Buffer
  /** HTTP headers (lowercased keys). */
  headers: Record<string, string | undefined>
  /** Parsed query string. */
  query: URLSearchParams
}

/** A short-circuit response — used for handshakes (e.g. Slack url_verification). */
export interface WebhookHandshakeResponse {
  status: number
  body: string
  contentType?: string
}

import type { SurfaceInfo } from '@anton/agent-core'

export type { SurfaceInfo }

/**
 * Canonical, provider-agnostic event the agent runner consumes.
 *
 * Anything provider-specific lives in `context` and is only read by the
 * same provider's `reply()` method.
 */
export interface CanonicalEvent {
  /** Provider slug (matches the URL path). */
  provider: string
  /** Stable session key. e.g. `slack:T123:C456:U789` or `telegram:42`. */
  sessionId: string
  /** Per-delivery dedupe key. Optional — providers without one skip dedup. */
  deliveryId?: string
  /** User-visible text the agent should respond to. */
  text: string
  /**
   * Image attachments the user uploaded with this message. Providers that
   * support file uploads (Slack file_share, Telegram photo, …) should
   * download the bytes and base64-encode them into this shape; the runner
   * passes them straight through to Session.processMessage. Non-image files
   * are silently dropped today — the model only understands images.
   */
  attachments?: CanonicalImageAttachment[]
  /**
   * Where this message is coming from. The runner passes this to the
   * Session every turn (not just on create) so an existing session picks
   * up new thread/user identity without a restart. Omit for desktop; the
   * runner treats absence as "local desktop client".
   */
  surface?: SurfaceInfo
  /** Free-form provider context, opaque to the router. */
  context: Record<string, unknown>
}

/**
 * Shape the agent-core Session expects for multimodal input. Mirrors
 * `ChatImageAttachmentInput` in @anton/protocol (we don't import it here to
 * keep the webhook layer decoupled from the desktop protocol package).
 */
export interface CanonicalImageAttachment {
  id: string
  name: string
  mimeType: string
  /** base64-encoded image bytes (no data: URL prefix). */
  data: string
  sizeBytes: number
}

/**
 * An image the agent wants to send *back* to the user — e.g. a browser
 * screenshot or generated chart. Collected by the webhook runner from
 * events the session emits during a turn and handed to the provider's
 * reply() method for upload.
 */
export interface OutboundImage {
  /** base64-encoded image bytes (no data: URL prefix). */
  data: string
  /** e.g. `image/jpeg`, `image/png`. */
  mimeType: string
  /** Optional short caption — used as Slack file title / Telegram photo caption. */
  caption?: string
  /** Stable id for logging. */
  id: string
}

/**
 * Rich result type returned by the webhook runner for a single turn.
 * Replaces the previous `Promise<string>` so the router can hand outbound
 * images to the provider alongside the text reply. Absent/empty fields
 * are the common case and should be treated as "nothing to send".
 */
export interface WebhookRunResult {
  text: string
  images: OutboundImage[]
}

export interface WebhookProvider {
  /** URL slug under /_anton/webhooks/{slug}. Must be unique. */
  readonly slug: string

  /**
   * Optional handshake handler. If it returns a response, the router writes
   * that response and skips verify/parse/dispatch. Used for Slack
   * `url_verification` challenges and similar one-shot setup pings.
   */
  handleHandshake?(req: WebhookRequest): WebhookHandshakeResponse | null

  /**
   * Verify the request is authentic. Return false (or throw) to reject.
   * Providers without verification should return true.
   */
  verify(req: WebhookRequest): Promise<boolean> | boolean

  /**
   * Parse the raw body into 0..N canonical events. An empty array is valid
   * (e.g. Slack heartbeat events we don't care about).
   */
  parse(req: WebhookRequest): Promise<CanonicalEvent[]> | CanonicalEvent[]

  reply(event: CanonicalEvent, text: string, images: OutboundImage[]): Promise<void>

  onTurnStart?(event: CanonicalEvent): Promise<void> | void

  onTurnEnd?(event: CanonicalEvent, result: { ok: boolean }): Promise<void> | void

  // ── Mid-turn messaging (Phase 2) ──────────────────────────────────

  /**
   * Send a message during a turn (progress updates, sub-agent status).
   * Returns a message ID that can be passed to editMessage() for updates.
   */
  sendMessage?(event: CanonicalEvent, text: string): Promise<string | undefined>

  /**
   * Edit a previously sent message. Used to update progress messages
   * in-place rather than posting new ones.
   */
  editMessage?(event: CanonicalEvent, messageId: string, text: string): Promise<void>

  // ── Interactive prompts (Phase 3) ─────────────────────────────────

  /**
   * Send a confirmation prompt with interactive buttons (e.g. Slack Block Kit,
   * Telegram inline keyboard). Falls back to text-based prompt if not implemented.
   */
  sendConfirmPrompt?(
    event: CanonicalEvent,
    interactionId: string,
    command: string,
    reason: string,
  ): Promise<void>

  /**
   * Send a plan for approval with interactive buttons. Falls back to
   * text-based prompt if not implemented.
   */
  sendPlanForApproval?(
    event: CanonicalEvent,
    interactionId: string,
    title: string,
    content: string,
  ): Promise<void>

  // ── Inline button menus (model picker, project picker, etc.) ──────

  /**
   * Send a stateless multi-row button menu and return a ref so the
   * runner can edit it later (drill-down navigation, confirmation,
   * etc.). Each button's `action` is round-tripped through the
   * provider's interactive callback layer back to the runner via
   * `handleInteraction` returning an `InteractionResult` of type
   * `menu_action`. Optional — providers without button support fall
   * back to text replies.
   */
  sendInlineMenu?(event: CanonicalEvent, opts: InlineMenuOpts): Promise<InlineMenuRef | null>

  /**
   * Edit a previously sent inline menu in place. Used for drill-down
   * (root → provider list → model list → confirm) without spamming
   * new messages into the channel.
   */
  editInlineMenu?(ref: InlineMenuRef, opts: InlineMenuOpts): Promise<void>

  /**
   * Handle an interactive callback (button click, inline keyboard response).
   * Used for sub-path routing (e.g. /_anton/webhooks/slack-bot/interact).
   */
  handleInteraction?(req: WebhookRequest): Promise<InteractionResult | null>
}

/** A single button in an inline menu. */
export interface MenuButton {
  /** Visible label. Telegram caps text at ~64 chars; Slack at 75. Keep short. */
  label: string
  /**
   * Compact action identifier (≤ 64 bytes for Telegram callback_data).
   * Round-tripped opaquely through the provider; the runner interprets it.
   * Convention: namespaced with a 1-char prefix, e.g. "m:p:codex".
   */
  action: string
}

export type MenuRow = MenuButton[]

export interface InlineMenuOpts {
  /** Plain-text body shown above the buttons. */
  body: string
  /** 2D array of buttons. Outer = rows, inner = columns. */
  rows: MenuRow[]
}

/**
 * Opaque reference to a sent menu message so the runner can edit it
 * later. Each provider populates the fields it needs to address the
 * specific message; the runner treats this as a black box.
 */
export interface InlineMenuRef {
  /** Provider slug — disambiguates which provider owns this ref. */
  provider: string
  /** Channel/chat scope (Telegram chat_id, Slack channel id). */
  channelId: string
  /** Message identifier within the scope (Telegram message_id, Slack ts). */
  messageId: string
}

/**
 * Result of an interactive callback (button click). The router uses this
 * to either resolve a pending agent interaction (confirm/plan) or
 * dispatch a stateless menu navigation back to the runner.
 */
export type InteractionResult =
  | {
      type: 'confirm_response' | 'plan_response'
      sessionId: string
      approved: boolean
      feedback?: string
      userId?: string
    }
  | {
      type: 'menu_action'
      sessionId: string
      /** The button's `action` string from InlineMenuOpts.rows. */
      action: string
      /** Ref to the message the button was attached to, for editInlineMenu. */
      ref: InlineMenuRef
      userId?: string
    }
