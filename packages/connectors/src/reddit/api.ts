/**
 * Typed Reddit API client.
 * Makes direct HTTP calls — no MCP subprocess, no SDK dependency.
 * Uses OAuth bearer tokens against https://oauth.reddit.com
 */

const BASE_URL = 'https://oauth.reddit.com'
const USER_AGENT = 'anton-computer:v1.0.0 (by /u/anton-agent)'

export class RedditAPI {
  private token = ''

  setToken(token: string) {
    this.token = token
  }

  private async call<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${BASE_URL}${path}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': USER_AGENT,
    }

    let fetchBody: string | undefined
    if (method === 'POST' && body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      fetchBody = new URLSearchParams(
        Object.entries(body).reduce(
          (acc, [k, v]) => {
            if (v !== undefined && v !== null) acc[k] = String(v)
            return acc
          },
          {} as Record<string, string>,
        ),
      ).toString()
    }

    const res = await fetch(url, {
      method,
      headers,
      body: fetchBody,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Reddit API ${method} ${path}: HTTP ${res.status} ${text}`)
    }

    return (await res.json()) as T
  }

  private buildQuery(params: Record<string, unknown>): string {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null,
    )
    if (entries.length === 0) return ''
    return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`
  }

  // ── Identity ──

  async getMe(): Promise<{
    name: string
    id: string
    comment_karma: number
    link_karma: number
    created_utc: number
    has_verified_email: boolean
    icon_img: string
    subreddit?: { display_name: string; subscribers: number }
  }> {
    return this.call('GET', '/api/v1/me')
  }

  // ── Subreddit browsing ──

  async getSubreddit(
    name: string,
    opts: { sort?: string; limit?: number; after?: string; t?: string } = {},
  ): Promise<{
    data: {
      children: Array<{
        data: {
          id: string
          name: string
          title: string
          author: string
          subreddit: string
          selftext: string
          url: string
          permalink: string
          score: number
          upvote_ratio: number
          num_comments: number
          created_utc: number
          is_self: boolean
          link_flair_text: string | null
          over_18: boolean
          stickied: boolean
        }
      }>
      after: string | null
    }
  }> {
    const sort = opts.sort || 'hot'
    const query = this.buildQuery({
      limit: opts.limit || 25,
      after: opts.after,
      t: opts.t,
    })
    return this.call('GET', `/r/${encodeURIComponent(name)}/${sort}.json${query}`)
  }

  // ── Post + comments ──

  async getPost(
    subreddit: string,
    postId: string,
    opts: { sort?: string; limit?: number } = {},
  ): Promise<
    [
      {
        data: {
          children: Array<{
            data: {
              id: string
              name: string
              title: string
              author: string
              selftext: string
              url: string
              score: number
              upvote_ratio: number
              num_comments: number
              created_utc: number
              is_self: boolean
            }
          }>
        }
      },
      {
        data: {
          children: Array<{
            data: {
              id: string
              name: string
              author: string
              body: string
              score: number
              created_utc: number
              replies?: unknown
            }
          }>
        }
      },
    ]
  > {
    const query = this.buildQuery({
      sort: opts.sort || 'best',
      limit: opts.limit || 25,
    })
    return this.call(
      'GET',
      `/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(postId)}.json${query}`,
    )
  }

  // ── Search ──

  async searchPosts(
    query: string,
    opts: { subreddit?: string; sort?: string; t?: string; limit?: number; after?: string } = {},
  ): Promise<{
    data: {
      children: Array<{
        data: {
          id: string
          name: string
          title: string
          author: string
          subreddit: string
          selftext: string
          url: string
          permalink: string
          score: number
          num_comments: number
          created_utc: number
          is_self: boolean
        }
      }>
      after: string | null
    }
  }> {
    const params = this.buildQuery({
      q: query,
      sort: opts.sort || 'relevance',
      t: opts.t || 'all',
      limit: opts.limit || 25,
      after: opts.after,
      restrict_sr: opts.subreddit ? 'true' : undefined,
      type: 'link',
    })
    const prefix = opts.subreddit
      ? `/r/${encodeURIComponent(opts.subreddit)}`
      : ''
    return this.call('GET', `${prefix}/search.json${params}`)
  }

  // ── Submit posts ──

  async submitTextPost(
    subreddit: string,
    title: string,
    text: string,
  ): Promise<{
    json: { data: { id: string; name: string; url: string } }
  }> {
    return this.call('POST', '/api/submit', {
      sr: subreddit,
      kind: 'self',
      title,
      text,
      api_type: 'json',
    })
  }

  async submitLinkPost(
    subreddit: string,
    title: string,
    url: string,
  ): Promise<{
    json: { data: { id: string; name: string; url: string } }
  }> {
    return this.call('POST', '/api/submit', {
      sr: subreddit,
      kind: 'link',
      title,
      url,
      api_type: 'json',
    })
  }

  // ── Comments ──

  async addComment(
    parentFullname: string,
    text: string,
  ): Promise<{
    json: {
      data: {
        things: Array<{
          data: { id: string; name: string; body: string; author: string }
        }>
      }
    }
  }> {
    return this.call('POST', '/api/comment', {
      thing_id: parentFullname,
      text,
      api_type: 'json',
    })
  }

  // ── Voting ──

  async vote(fullname: string, dir: number): Promise<void> {
    await this.call('POST', '/api/vote', { id: fullname, dir })
  }

  // ── Subscriptions ──

  async getSubscriptions(
    opts: { limit?: number; after?: string } = {},
  ): Promise<{
    data: {
      children: Array<{
        data: {
          display_name: string
          title: string
          subscribers: number
          public_description: string
          url: string
          over18: boolean
          created_utc: number
        }
      }>
      after: string | null
    }
  }> {
    const query = this.buildQuery({
      limit: opts.limit || 25,
      after: opts.after,
    })
    return this.call('GET', `/subreddits/mine/subscriber.json${query}`)
  }

  // ── User posts ──

  async getUserPosts(
    username: string,
    opts: { sort?: string; limit?: number; after?: string; t?: string } = {},
  ): Promise<{
    data: {
      children: Array<{
        data: {
          id: string
          name: string
          title: string
          author: string
          subreddit: string
          selftext: string
          url: string
          permalink: string
          score: number
          num_comments: number
          created_utc: number
          is_self: boolean
        }
      }>
      after: string | null
    }
  }> {
    const sort = opts.sort || 'new'
    const query = this.buildQuery({
      limit: opts.limit || 25,
      after: opts.after,
      t: opts.t,
    })
    return this.call(
      'GET',
      `/user/${encodeURIComponent(username)}/submitted.json${query}`,
    )
  }
}
