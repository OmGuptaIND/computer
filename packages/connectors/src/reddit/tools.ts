/**
 * Reddit connector tools — direct API, no MCP subprocess.
 */

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import type { RedditAPI } from './api.js'

function toolResult(output: string, isError = false) {
  const content = [{ type: 'text' as const, text: output }]
  return { content, details: { raw: output, isError } }
}

function defineTool<T extends TSchema>(
  def: Omit<AgentTool<T>, 'execute'> & {
    execute: (
      toolCallId: string,
      params: Static<T>,
      signal?: AbortSignal,
    ) => Promise<AgentToolResult<unknown>>
  },
): AgentTool {
  return def as AgentTool
}

const SELFTEXT_PREVIEW_LIMIT = 500

function formatTimestamp(utc: number): string {
  return new Date(utc * 1000).toISOString()
}

export function createRedditTools(api: RedditAPI): AgentTool[] {
  return [
    defineTool({
      name: 'reddit_get_me',
      label: 'Get My Profile',
      description: '[Reddit] Get the authenticated user\'s profile info including karma and account details.',
      parameters: Type.Object({}),
      async execute() {
        try {
          const me = await api.getMe()
          return toolResult(
            JSON.stringify(
              {
                username: me.name,
                id: me.id,
                comment_karma: me.comment_karma,
                link_karma: me.link_karma,
                created: formatTimestamp(me.created_utc),
                verified_email: me.has_verified_email,
              },
              null,
              2,
            ),
          )
        } catch (err) {
          return toolResult(`Error getting profile: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_get_subreddit',
      label: 'Browse Subreddit',
      description:
        '[Reddit] Browse posts from a subreddit. Supports sorting by hot, new, top, rising.',
      parameters: Type.Object({
        subreddit: Type.String({ description: 'Subreddit name without r/ prefix (e.g. "programming")' }),
        sort: Type.Optional(
          Type.String({ description: 'Sort order: hot, new, top, rising (default: hot)' }),
        ),
        limit: Type.Optional(
          Type.Number({ description: 'Number of posts to return (default: 25, max: 100)' }),
        ),
        time: Type.Optional(
          Type.String({
            description: 'Time filter for "top" sort: hour, day, week, month, year, all (default: day)',
          }),
        ),
        after: Type.Optional(
          Type.String({ description: 'Pagination cursor from a previous response to fetch the next page' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.getSubreddit(params.subreddit, {
            sort: params.sort,
            limit: params.limit,
            t: params.time,
            after: params.after,
          })
          const posts = result.data.children.map((c) => ({
            id: c.data.id,
            fullname: c.data.name,
            title: c.data.title,
            author: c.data.author,
            subreddit: c.data.subreddit,
            score: c.data.score,
            upvote_ratio: c.data.upvote_ratio,
            comments: c.data.num_comments,
            url: c.data.is_self ? `https://reddit.com${c.data.permalink}` : c.data.url,
            permalink: `https://reddit.com${c.data.permalink}`,
            is_self: c.data.is_self,
            selftext: c.data.selftext ? c.data.selftext.slice(0, SELFTEXT_PREVIEW_LIMIT) : undefined,
            flair: c.data.link_flair_text,
            created: formatTimestamp(c.data.created_utc),
            nsfw: c.data.over_18,
            stickied: c.data.stickied,
          }))
          return toolResult(JSON.stringify({ posts, after: result.data.after }, null, 2))
        } catch (err) {
          return toolResult(`Error browsing subreddit: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_get_post',
      label: 'Get Post',
      description:
        '[Reddit] Get a specific post with its comments. Returns the post content and top-level comments.',
      parameters: Type.Object({
        subreddit: Type.Optional(Type.String({ description: 'Subreddit name without r/ prefix (optional, improves performance)' })),
        post_id: Type.String({ description: 'Post ID (e.g. "1abc2de")' }),
        sort: Type.Optional(
          Type.String({ description: 'Comment sort: best, top, new, controversial (default: best)' }),
        ),
        comment_limit: Type.Optional(
          Type.Number({ description: 'Max number of comments to return (default: 25)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const [postListing, commentListing] = await api.getPost(
            params.subreddit,
            params.post_id,
            { sort: params.sort, limit: params.comment_limit },
          )

          const postData = postListing.data.children[0]?.data
          if (!postData) {
            return toolResult('Post not found', true)
          }

          const post = {
            id: postData.id,
            fullname: postData.name,
            title: postData.title,
            author: postData.author,
            selftext: postData.selftext,
            url: postData.url,
            score: postData.score,
            upvote_ratio: postData.upvote_ratio,
            comments_count: postData.num_comments,
            created: formatTimestamp(postData.created_utc),
            is_self: postData.is_self,
          }

          const comments = commentListing.data.children
            .filter((c) => c.data.author) // filter out "more" placeholders
            .map((c) => ({
              id: c.data.id,
              fullname: c.data.name,
              author: c.data.author,
              body: c.data.body,
              score: c.data.score,
              created: formatTimestamp(c.data.created_utc),
            }))

          return toolResult(JSON.stringify({ post, comments }, null, 2))
        } catch (err) {
          return toolResult(`Error getting post: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_search',
      label: 'Search Posts',
      description:
        '[Reddit] Search for posts across Reddit or within a specific subreddit.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query' }),
        subreddit: Type.Optional(
          Type.String({ description: 'Limit search to this subreddit (without r/ prefix)' }),
        ),
        sort: Type.Optional(
          Type.String({ description: 'Sort: relevance, hot, top, new, comments (default: relevance)' }),
        ),
        time: Type.Optional(
          Type.String({ description: 'Time filter: hour, day, week, month, year, all (default: all)' }),
        ),
        limit: Type.Optional(
          Type.Number({ description: 'Max results (default: 25, max: 100)' }),
        ),
        after: Type.Optional(
          Type.String({ description: 'Pagination cursor from a previous response to fetch the next page' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.searchPosts(params.query, {
            subreddit: params.subreddit,
            sort: params.sort,
            t: params.time,
            limit: params.limit,
            after: params.after,
          })
          const posts = result.data.children.map((c) => ({
            id: c.data.id,
            fullname: c.data.name,
            title: c.data.title,
            author: c.data.author,
            subreddit: c.data.subreddit,
            score: c.data.score,
            comments: c.data.num_comments,
            url: c.data.is_self ? `https://reddit.com${c.data.permalink}` : c.data.url,
            permalink: `https://reddit.com${c.data.permalink}`,
            is_self: c.data.is_self,
            selftext: c.data.selftext ? c.data.selftext.slice(0, SELFTEXT_PREVIEW_LIMIT) : undefined,
            created: formatTimestamp(c.data.created_utc),
          }))
          return toolResult(JSON.stringify({ posts, after: result.data.after }, null, 2))
        } catch (err) {
          return toolResult(`Error searching: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_submit_text_post',
      label: 'Submit Text Post',
      description: '[Reddit] Submit a new text (self) post to a subreddit.',
      parameters: Type.Object({
        subreddit: Type.String({ description: 'Subreddit to post to (without r/ prefix)' }),
        title: Type.String({ description: 'Post title' }),
        text: Type.String({ description: 'Post body text (supports markdown)' }),
      }),
      async execute(_id, params) {
        try {
          const result = await api.submitTextPost(params.subreddit, params.title, params.text)
          const data = result.json.data
          return toolResult(
            `Post submitted: ${data.url}\nID: ${data.id}\nFullname: ${data.name}`,
          )
        } catch (err) {
          return toolResult(`Error submitting post: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_submit_link_post',
      label: 'Submit Link Post',
      description: '[Reddit] Submit a new link post to a subreddit.',
      parameters: Type.Object({
        subreddit: Type.String({ description: 'Subreddit to post to (without r/ prefix)' }),
        title: Type.String({ description: 'Post title' }),
        url: Type.String({ description: 'URL to link to' }),
      }),
      async execute(_id, params) {
        try {
          const result = await api.submitLinkPost(params.subreddit, params.title, params.url)
          const data = result.json.data
          return toolResult(
            `Link post submitted: ${data.url}\nID: ${data.id}\nFullname: ${data.name}`,
          )
        } catch (err) {
          return toolResult(`Error submitting link post: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_add_comment',
      label: 'Add Comment',
      description:
        '[Reddit] Add a comment to a post or reply to a comment. Use the fullname (e.g. t3_abc123 for posts, t1_abc123 for comments).',
      parameters: Type.Object({
        parent_fullname: Type.String({
          description:
            'Fullname of the parent (t3_<id> for a post, t1_<id> for a comment)',
        }),
        text: Type.String({ description: 'Comment text (supports markdown)' }),
      }),
      async execute(_id, params) {
        try {
          const result = await api.addComment(params.parent_fullname, params.text)
          const comment = result.json.data.things?.[0]?.data
          if (comment) {
            return toolResult(
              `Comment posted by ${comment.author}\nID: ${comment.name}\n${comment.body.slice(0, 200)}`,
            )
          }
          return toolResult('Comment posted successfully')
        } catch (err) {
          return toolResult(`Error adding comment: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_vote',
      label: 'Vote',
      description:
        '[Reddit] Upvote, downvote, or remove vote on a post or comment.',
      parameters: Type.Object({
        fullname: Type.String({
          description: 'Fullname of the target (t3_<id> for posts, t1_<id> for comments)',
        }),
        direction: Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('none')], {
          description: 'Vote direction: "up", "down", or "none" to remove vote',
        }),
      }),
      async execute(_id, params) {
        try {
          const dir = params.direction === 'up' ? 1 : params.direction === 'down' ? -1 : 0
          await api.vote(params.fullname, dir)
          const action =
            params.direction === 'none' ? 'Vote removed' : `${params.direction === 'up' ? 'Upvoted' : 'Downvoted'}`
          return toolResult(`${action}: ${params.fullname}`)
        } catch (err) {
          return toolResult(`Error voting: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_get_subscriptions',
      label: 'Get Subscriptions',
      description: '[Reddit] List the authenticated user\'s subscribed subreddits.',
      parameters: Type.Object({
        limit: Type.Optional(
          Type.Number({ description: 'Max subreddits to return (default: 25, max: 100)' }),
        ),
        after: Type.Optional(
          Type.String({ description: 'Pagination cursor from a previous response to fetch the next page' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.getSubscriptions({ limit: params.limit, after: params.after })
          const subs = result.data.children.map((c) => ({
            name: c.data.display_name,
            title: c.data.title,
            subscribers: c.data.subscribers,
            description: c.data.public_description
              ? c.data.public_description.slice(0, 200)
              : undefined,
            url: `https://reddit.com${c.data.url}`,
            nsfw: c.data.over18,
          }))
          return toolResult(JSON.stringify({ subreddits: subs, after: result.data.after }, null, 2))
        } catch (err) {
          return toolResult(`Error getting subscriptions: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'reddit_get_user_posts',
      label: 'Get User Posts',
      description: '[Reddit] Get posts submitted by a specific user.',
      parameters: Type.Object({
        username: Type.String({ description: 'Reddit username (without u/ prefix)' }),
        sort: Type.Optional(
          Type.String({ description: 'Sort: hot, new, top, controversial (default: new)' }),
        ),
        limit: Type.Optional(
          Type.Number({ description: 'Max posts to return (default: 25, max: 100)' }),
        ),
        time: Type.Optional(
          Type.String({
            description: 'Time filter for "top" sort: hour, day, week, month, year, all',
          }),
        ),
        after: Type.Optional(
          Type.String({ description: 'Pagination cursor from a previous response to fetch the next page' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const result = await api.getUserPosts(params.username, {
            sort: params.sort,
            limit: params.limit,
            t: params.time,
            after: params.after,
          })
          const posts = result.data.children.map((c) => ({
            id: c.data.id,
            fullname: c.data.name,
            title: c.data.title,
            subreddit: c.data.subreddit,
            score: c.data.score,
            comments: c.data.num_comments,
            url: c.data.is_self ? `https://reddit.com${c.data.permalink}` : c.data.url,
            permalink: `https://reddit.com${c.data.permalink}`,
            is_self: c.data.is_self,
            selftext: c.data.selftext ? c.data.selftext.slice(0, SELFTEXT_PREVIEW_LIMIT) : undefined,
            created: formatTimestamp(c.data.created_utc),
          }))
          return toolResult(JSON.stringify({ posts, after: result.data.after }, null, 2))
        } catch (err) {
          return toolResult(`Error getting user posts: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
