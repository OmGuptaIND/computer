import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import type { LinearAPI } from './api.js'

function toolResult(output: string, isError = false) {
  return { content: [{ type: 'text' as const, text: output }], details: { raw: output, isError } }
}

function defineTool<T extends TSchema>(
  def: Omit<AgentTool<T>, 'execute'> & {
    execute: (
      id: string,
      params: Static<T>,
      signal?: AbortSignal,
    ) => Promise<AgentToolResult<unknown>>
  },
): AgentTool {
  return def as AgentTool
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

export function createLinearTools(api: LinearAPI): AgentTool[] {
  return [
    defineTool({
      name: 'linear_list_issues',
      label: 'List Issues',
      description:
        '[Linear] List issues with optional filters by team, state, assignee, or priority.',
      parameters: Type.Object({
        team_id: Type.Optional(
          Type.String({ description: 'Filter by team ID (use linear_list_teams to find IDs)' }),
        ),
        state_type: Type.Optional(
          Type.String({
            description:
              'Filter by state type: backlog | unstarted | started | completed | cancelled',
          }),
        ),
        assignee_id: Type.Optional(Type.String({ description: 'Filter by assignee user ID' })),
        priority: Type.Optional(
          Type.Number({
            description: 'Filter by priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low',
          }),
        ),
        limit: Type.Optional(Type.Number({ description: 'Max issues to return (default: 25)' })),
      }),
      async execute(_id, params) {
        try {
          const issues = await api.listIssues({
            teamId: params.team_id,
            stateType: params.state_type,
            assigneeId: params.assignee_id,
            priority: params.priority,
            first: params.limit,
          })
          if (!issues.length) return toolResult('No issues found.')
          return toolResult(
            JSON.stringify(
              issues.map((i) => ({
                id: i.id,
                identifier: i.identifier,
                title: i.title,
                state: i.state?.name,
                priority: PRIORITY_LABELS[i.priority] ?? i.priority,
                team: i.team?.name,
                assignee: i.assignee?.displayName ?? i.assignee?.name,
                dueDate: i.dueDate ?? null,
                url: i.url,
              })),
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
      name: 'linear_get_issue',
      label: 'Get Issue',
      description: '[Linear] Get full details of an issue by its ID or identifier (e.g. ENG-123).',
      parameters: Type.Object({
        issue_id: Type.String({ description: 'Issue UUID or identifier like ENG-123' }),
      }),
      async execute(_id, params) {
        try {
          const issue = await api.getIssue(params.issue_id)
          return toolResult(
            JSON.stringify(
              {
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                description: issue.description,
                state: issue.state ? { name: issue.state.name, type: issue.state.type } : null,
                priority: PRIORITY_LABELS[issue.priority] ?? issue.priority,
                team: issue.team ? { id: issue.team.id, name: issue.team.name } : null,
                assignee: issue.assignee
                  ? { id: issue.assignee.id, name: issue.assignee.displayName }
                  : null,
                creator: issue.creator?.displayName ?? null,
                labels: issue.labels?.nodes.map((l) => l.name) ?? [],
                dueDate: issue.dueDate ?? null,
                createdAt: issue.createdAt,
                updatedAt: issue.updatedAt,
                url: issue.url,
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
      name: 'linear_search_issues',
      label: 'Search Issues',
      description: '[Linear] Search issues by text across title and description.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query text' }),
        limit: Type.Optional(Type.Number({ description: 'Max results (default: 20)' })),
      }),
      async execute(_id, params) {
        try {
          const issues = await api.searchIssues(params.query, params.limit ?? 20)
          if (!issues.length) return toolResult('No issues found.')
          return toolResult(
            JSON.stringify(
              issues.map((i) => ({
                identifier: i.identifier,
                title: i.title,
                state: i.state?.name,
                priority: PRIORITY_LABELS[i.priority] ?? i.priority,
                team: i.team?.name,
                assignee: i.assignee?.displayName,
                url: i.url,
              })),
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
      name: 'linear_create_issue',
      label: 'Create Issue',
      description: '[Linear] Create a new issue in a team.',
      parameters: Type.Object({
        team_id: Type.String({ description: 'Team ID (use linear_list_teams)' }),
        title: Type.String({ description: 'Issue title' }),
        description: Type.Optional(
          Type.String({ description: 'Issue description (markdown supported)' }),
        ),
        priority: Type.Optional(
          Type.Number({ description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' }),
        ),
        state_id: Type.Optional(
          Type.String({ description: 'Workflow state ID (use linear_list_states)' }),
        ),
        assignee_id: Type.Optional(Type.String({ description: 'Assignee user ID' })),
        due_date: Type.Optional(Type.String({ description: 'Due date YYYY-MM-DD' })),
      }),
      async execute(_id, params) {
        try {
          const issue = await api.createIssue({
            teamId: params.team_id,
            title: params.title,
            description: params.description,
            priority: params.priority,
            stateId: params.state_id,
            assigneeId: params.assignee_id,
            dueDate: params.due_date,
          })
          return toolResult(`Issue created: ${issue.identifier}\n${issue.url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'linear_update_issue',
      label: 'Update Issue',
      description:
        '[Linear] Update an existing issue (title, description, state, priority, assignee, due date).',
      parameters: Type.Object({
        issue_id: Type.String({ description: 'Issue UUID or identifier like ENG-123' }),
        title: Type.Optional(Type.String({ description: 'New title' })),
        description: Type.Optional(Type.String({ description: 'New description (markdown)' })),
        priority: Type.Optional(
          Type.Number({ description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' }),
        ),
        state_id: Type.Optional(Type.String({ description: 'New workflow state ID' })),
        assignee_id: Type.Optional(
          Type.String({ description: 'New assignee user ID (empty string to unassign)' }),
        ),
        due_date: Type.Optional(
          Type.String({ description: 'Due date YYYY-MM-DD (empty string to clear)' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const input: Record<string, unknown> = {}
          if (params.title !== undefined) input.title = params.title
          if (params.description !== undefined) input.description = params.description
          if (params.priority !== undefined) input.priority = params.priority
          if (params.state_id !== undefined) input.stateId = params.state_id
          if (params.assignee_id !== undefined) input.assigneeId = params.assignee_id || null
          if (params.due_date !== undefined) input.dueDate = params.due_date || null
          const issue = await api.updateIssue(params.issue_id, input)
          return toolResult(`Issue updated: ${issue.identifier}\n${issue.url}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'linear_add_comment',
      label: 'Add Comment',
      description: '[Linear] Add a comment to an issue.',
      parameters: Type.Object({
        issue_id: Type.String({ description: 'Issue UUID or identifier like ENG-123' }),
        body: Type.String({ description: 'Comment text (markdown supported)' }),
      }),
      async execute(_id, params) {
        try {
          const comment = await api.addComment(params.issue_id, params.body)
          return toolResult(`Comment added. ID: ${comment.id}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'linear_list_comments',
      label: 'List Comments',
      description: '[Linear] List all comments on an issue.',
      parameters: Type.Object({
        issue_id: Type.String({ description: 'Issue UUID or identifier like ENG-123' }),
      }),
      async execute(_id, params) {
        try {
          const comments = await api.listComments(params.issue_id)
          if (!comments.length) return toolResult('No comments.')
          return toolResult(
            JSON.stringify(
              comments.map((c) => ({
                id: c.id,
                author: c.user?.displayName ?? c.user?.name ?? 'Unknown',
                body: c.body,
                createdAt: c.createdAt,
              })),
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
      name: 'linear_list_teams',
      label: 'List Teams',
      description: '[Linear] List all teams in the workspace.',
      parameters: Type.Object({}),
      async execute(_id, _params) {
        try {
          return toolResult(JSON.stringify(await api.listTeams(), null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'linear_list_states',
      label: 'List Workflow States',
      description: '[Linear] List all workflow states for a team.',
      parameters: Type.Object({
        team_id: Type.String({ description: 'Team ID (use linear_list_teams)' }),
      }),
      async execute(_id, params) {
        try {
          return toolResult(JSON.stringify(await api.listStates(params.team_id), null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'linear_list_projects',
      label: 'List Projects',
      description: '[Linear] List all projects, optionally filtered by team.',
      parameters: Type.Object({
        team_id: Type.Optional(Type.String({ description: 'Filter by team ID' })),
      }),
      async execute(_id, params) {
        try {
          const projects = await api.listProjects(params.team_id)
          if (!projects.length) return toolResult('No projects found.')
          return toolResult(JSON.stringify(projects, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'linear_my_issues',
      label: 'My Issues',
      description: '[Linear] List issues assigned to me.',
      parameters: Type.Object({
        state_type: Type.Optional(
          Type.String({
            description: 'Filter: backlog | unstarted | started | completed | cancelled',
          }),
        ),
        limit: Type.Optional(Type.Number({ description: 'Max results (default: 25)' })),
      }),
      async execute(_id, params) {
        try {
          const me = await api.getViewer()
          const issues = await api.listIssues({
            assigneeId: me.id,
            stateType: params.state_type,
            first: params.limit,
          })
          if (!issues.length) return toolResult('No issues assigned to you.')
          return toolResult(
            JSON.stringify(
              issues.map((i) => ({
                identifier: i.identifier,
                title: i.title,
                state: i.state?.name,
                priority: PRIORITY_LABELS[i.priority] ?? i.priority,
                team: i.team?.name,
                dueDate: i.dueDate ?? null,
                url: i.url,
              })),
              null,
              2,
            ),
          )
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
