import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
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
        query: Type.String({
          description: 'Search query (e.g., "addClass language:js repo:owner/name")',
        }),
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
        query: Type.String({
          description: 'Search query (e.g., "bug label:bug state:open repo:owner/name")',
        }),
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

    // ── Branch tools ──

    defineTool({
      name: 'github_get_branch',
      label: 'Get Branch',
      description:
        '[GitHub] Get branch info including latest commit SHA. Useful before creating a new branch.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        branch: Type.String({ description: 'Branch name (e.g., "main")' }),
      }),
      async execute(_id, params) {
        try {
          const branch = await api.getBranch(params.owner, params.repo, params.branch)
          return toolResult(
            JSON.stringify(
              {
                name: branch.name,
                sha: branch.commit.sha,
                protected: branch.protected,
              },
              null,
              2,
            ),
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_create_branch',
      label: 'Create Branch',
      description:
        '[GitHub] Create a new branch from a specific commit SHA. Get the SHA from github_get_branch first.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        branch: Type.String({ description: 'New branch name' }),
        from_sha: Type.String({ description: 'SHA of the commit to branch from' }),
      }),
      async execute(_id, params) {
        try {
          const ref = await api.createBranch(
            params.owner,
            params.repo,
            params.branch,
            params.from_sha,
          )
          return toolResult(`Created branch "${params.branch}" at ${ref.object.sha}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    // ── File mutation tools ──

    defineTool({
      name: 'github_create_or_update_file',
      label: 'Create or Update File',
      description:
        '[GitHub] Create or update a file in a repository via the API (commits directly). Content must be provided as plain text and will be base64-encoded automatically. To update an existing file, provide its current SHA (from github_get_file_content).',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        path: Type.String({ description: 'File path in the repository' }),
        content: Type.String({ description: 'File content (plain text, will be base64-encoded)' }),
        message: Type.String({ description: 'Commit message' }),
        branch: Type.Optional(
          Type.String({ description: 'Branch to commit to (default: repo default branch)' }),
        ),
        sha: Type.Optional(
          Type.String({ description: 'SHA of the file being replaced (required for updates)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const encoded = Buffer.from(params.content, 'utf-8').toString('base64')
          const result = await api.createOrUpdateFile(
            params.owner,
            params.repo,
            params.path,
            params.message,
            encoded,
            { branch: params.branch, sha: params.sha },
          )
          return toolResult(
            `File ${params.sha ? 'updated' : 'created'}: ${result.content.html_url}\nCommit: ${result.commit.html_url}`,
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_delete_file',
      label: 'Delete File',
      description:
        '[GitHub] Delete a file from a repository. Requires the file SHA (from github_get_file_content).',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        path: Type.String({ description: 'File path to delete' }),
        message: Type.String({ description: 'Commit message' }),
        sha: Type.String({ description: 'SHA of the file to delete' }),
        branch: Type.Optional(Type.String({ description: 'Branch to commit to' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.deleteFile(
            params.owner,
            params.repo,
            params.path,
            params.message,
            params.sha,
            { branch: params.branch },
          )
          return toolResult(`File deleted. Commit: ${result.commit.html_url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    // ── PR write tools ──

    defineTool({
      name: 'github_create_pr',
      label: 'Create Pull Request',
      description: '[GitHub] Create a new pull request.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        title: Type.String({ description: 'PR title' }),
        head: Type.String({ description: 'Branch containing changes' }),
        base: Type.String({ description: 'Branch to merge into (e.g., "main")' }),
        body: Type.Optional(Type.String({ description: 'PR description (Markdown)' })),
        draft: Type.Optional(Type.Boolean({ description: 'Create as draft PR' })),
      }),
      async execute(_id, params) {
        try {
          const pr = await api.createPullRequest(
            params.owner,
            params.repo,
            params.title,
            params.head,
            params.base,
            { body: params.body, draft: params.draft },
          )
          return toolResult(`Created PR #${pr.number}: ${pr.html_url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'github_merge_pr',
      label: 'Merge Pull Request',
      description: '[GitHub] Merge a pull request.',
      parameters: Type.Object({
        owner: Type.String({ description: 'Repository owner' }),
        repo: Type.String({ description: 'Repository name' }),
        pr_number: Type.Number({ description: 'PR number' }),
        merge_method: Type.Optional(
          Type.Union([Type.Literal('merge'), Type.Literal('squash'), Type.Literal('rebase')], {
            description: 'Merge method (default: merge)',
          }),
        ),
        commit_title: Type.Optional(Type.String({ description: 'Custom merge commit title' })),
      }),
      async execute(_id, params) {
        try {
          const result = await api.mergePullRequest(params.owner, params.repo, params.pr_number, {
            merge_method: params.merge_method,
            commit_title: params.commit_title,
          })
          if (result.merged) {
            return toolResult(`PR #${params.pr_number} merged successfully (${result.sha})`)
          }
          return toolResult(`PR #${params.pr_number} could not be merged: ${result.message}`, true)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
