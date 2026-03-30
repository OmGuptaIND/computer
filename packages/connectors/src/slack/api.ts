/**
 * Typed Slack Web API client.
 * Makes direct HTTP calls — no MCP subprocess, no SDK dependency.
 */

const BASE_URL = 'https://slack.com/api'

export class SlackAPI {
  private token = ''

  setToken(token: string) {
    this.token = token
  }

  private async call<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${BASE_URL}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      throw new Error(`Slack API ${method}: HTTP ${res.status}`)
    }

    const data = (await res.json()) as { ok: boolean; error?: string } & T
    if (!data.ok) {
      throw new Error(`Slack API ${method}: ${data.error || 'unknown error'}`)
    }

    return data as T
  }

  // ── Auth ──

  async authTest(): Promise<{ team: string; team_id: string; user: string; user_id: string }> {
    return this.call('auth.test')
  }

  // ── Channels ──

  async listChannels(opts: { types?: string; limit?: number; cursor?: string } = {}): Promise<{
    channels: Array<{
      id: string
      name: string
      is_channel: boolean
      is_private: boolean
      topic: { value: string }
      purpose: { value: string }
      num_members: number
    }>
    response_metadata?: { next_cursor: string }
  }> {
    return this.call('conversations.list', {
      types: opts.types || 'public_channel,private_channel',
      limit: opts.limit || 100,
      cursor: opts.cursor,
      exclude_archived: true,
    })
  }

  // ── Messages ──

  async postMessage(
    channel: string,
    text: string,
    opts?: { thread_ts?: string },
  ): Promise<{
    ts: string
    channel: string
  }> {
    return this.call('chat.postMessage', {
      channel,
      text,
      ...(opts?.thread_ts ? { thread_ts: opts.thread_ts } : {}),
    })
  }

  async getHistory(
    channel: string,
    opts: { limit?: number; oldest?: string; latest?: string } = {},
  ): Promise<{
    messages: Array<{
      type: string
      user?: string
      text: string
      ts: string
      thread_ts?: string
      reply_count?: number
    }>
    has_more: boolean
  }> {
    return this.call('conversations.history', {
      channel,
      limit: opts.limit || 20,
      ...(opts.oldest ? { oldest: opts.oldest } : {}),
      ...(opts.latest ? { latest: opts.latest } : {}),
    })
  }

  async getReplies(
    channel: string,
    ts: string,
    opts: { limit?: number } = {},
  ): Promise<{
    messages: Array<{ user?: string; text: string; ts: string }>
    has_more: boolean
  }> {
    return this.call('conversations.replies', {
      channel,
      ts,
      limit: opts.limit || 50,
    })
  }

  // ── Users ──

  async listUsers(opts: { limit?: number; cursor?: string } = {}): Promise<{
    members: Array<{
      id: string
      name: string
      real_name: string
      is_bot: boolean
      deleted: boolean
      profile: { email?: string; display_name?: string }
    }>
    response_metadata?: { next_cursor: string }
  }> {
    return this.call('users.list', {
      limit: opts.limit || 100,
      cursor: opts.cursor,
    })
  }

  async getUserInfo(userId: string): Promise<{
    user: {
      id: string
      name: string
      real_name: string
      profile: { email?: string; display_name?: string; status_text?: string }
    }
  }> {
    return this.call('users.info', { user: userId })
  }

  // ── Search ──

  async searchMessages(
    query: string,
    opts: { count?: number; sort?: string } = {},
  ): Promise<{
    messages: {
      total: number
      matches: Array<{
        channel: { id: string; name: string }
        username: string
        text: string
        ts: string
        permalink: string
      }>
    }
  }> {
    return this.call('search.messages', {
      query,
      count: opts.count || 20,
      sort: opts.sort || 'timestamp',
    })
  }

  // ── Reactions ──

  async addReaction(channel: string, timestamp: string, name: string): Promise<void> {
    await this.call('reactions.add', { channel, timestamp, name })
  }
}
