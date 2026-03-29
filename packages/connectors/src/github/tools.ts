import { Type, type TSchema, type Static } from '@sinclair/typebox'
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import type { GitHubAPI } from './api.js'

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

export function createGitHubTools(api: GitHubAPI): AgentTool[] {
  return [
    defineTool({
      name: 'github_list_repos',
      label: 'List Repositories',
      description: '[GitHub] List your repositories, sorted by most recently updated.',
      parameters: Type.Object({
        per_page: Type.Optional(Type.Number({ description: 'Results per page (default: 30)' })),
      }),
      async execute(_id, params) {
        try {
          const repos = await api.listRepos({ per_page: params.per_page })
          const summary = repos.map((r) => ({
            name: r.full_name,
            description: r.description,
            private: r.private,
            language: r.language,
            stars: r.stargazers_count,
          }))
          return toolResult(JSON.stringify(summary, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_get_repo',
      label: 'Get Repository',
      description: '[GitHub] Get details about a specific repository.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
      }),
      async execute(_id, params) {
        try {
          const repo = await api.getRepo(params.owner, params.repo)
          return toolResult(JSON.stringify(repo, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_list_issues',
      label: 'List Issues',
      description: '[GitHub] List issues for a repository.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        state: Type.Optional(Type.String({ description: 'open, closed, or all (default: open)' })),
        labels: Type.Optional(Type.String({ description: 'Comma-separated label names' })),
      }),
      async execute(_id, params) {
        try {
          const issues = await api.listIssues(params.owner, params.repo, {
            state: params.state,
            labels: params.labels,
          })
          const summary = issues.map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            author: i.user.login,
            labels: i.labels.map((l) => l.name),
            created: i.created_at,
          }))
          return toolResult(JSON.stringify(summary, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_get_issue',
      label: 'Get Issue',
      description: '[GitHub] Get a specific issue with full details.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        issue_number: Type.Number({ description: 'Issue number' }),
      }),
      async execute(_id, params) {
        try {
          const issue = await api.getIssue(params.owner, params.repo, params.issue_number)
          return toolResult(JSON.stringify(issue, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_create_issue',
      label: 'Create Issue',
      description: '[GitHub] Create a new issue in a repository.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        title: Type.String({ description: 'Issue title' }),
        body: Type.Optional(Type.String({ description: 'Issue body (Markdown)' })),
        labels: Type.Optional(Type.Array(Type.String(), { description: 'Label names' })),
      }),
      async execute(_id, params) {
        try {
          const issue = await api.createIssue(
            params.owner,
            params.repo,
            params.title,
            params.body,
            params.labels,
          )
          return toolResult(`Created issue #${issue.number}: ${issue.html_url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_add_comment',
      label: 'Add Comment',
      description: '[GitHub] Add a comment to an issue or pull request.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        issue_number: Type.Number({ description: 'Issue or PR number' }),
        body: Type.String({ description: 'Comment body (Markdown)' }),
      }),
      async execute(_id, params) {
        try {
          const comment = await api.addComment(
            params.owner,
            params.repo,
            params.issue_number,
            params.body,
          )
          return toolResult(`Comment added: ${comment.html_url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_list_prs',
      label: 'List Pull Requests',
      description: '[GitHub] List pull requests for a repository.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        state: Type.Optional(Type.String({ description: 'open, closed, or all (default: open)' })),
      }),
      async execute(_id, params) {
        try {
          const prs = await api.listPullRequests(params.owner, params.repo, {
            state: params.state,
          })
          const summary = prs.map((p) => ({
            number: p.number,
            title: p.title,
            state: p.state,
            author: p.user.login,
            head: p.head.ref,
            base: p.base.ref,
            draft: p.draft,
          }))
          return toolResult(JSON.stringify(summary, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_get_pr',
      label: 'Get Pull Request',
      description: '[GitHub] Get details about a specific pull request.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        pr_number: Type.Number({ description: 'PR number' }),
      }),
      async execute(_id, params) {
        try {
          const pr = await api.getPullRequest(params.owner, params.repo, params.pr_number)
          return toolResult(JSON.stringify(pr, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_search_code',
      label: 'Search Code',
      description: '[GitHub] Search for code across GitHub repositories.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query (e.g., "addClass language:js repo:owner/name")' }),
        per_page: Type.Optional(Type.Number({ description: 'Results per page (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.searchCode(params.query, { per_page: params.per_page })
          const matches = result.items.map((i) => ({
            file: i.path,
            repo: i.repository.full_name,
            url: i.html_url,
          }))
          return toolResult(
            `Found ${result.total_count} results:\n${JSON.stringify(matches, null, 2)}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_search_issues',
      label: 'Search Issues',
      description: '[GitHub] Search issues and pull requests across GitHub.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query (e.g., "bug label:bug state:open repo:owner/name")' }),
        per_page: Type.Optional(Type.Number({ description: 'Results per page (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.searchIssues(params.query, { per_page: params.per_page })
          const matches = result.items.map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            url: i.html_url,
          }))
          return toolResult(
            `Found ${result.total_count} results:\n${JSON.stringify(matches, null, 2)}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
