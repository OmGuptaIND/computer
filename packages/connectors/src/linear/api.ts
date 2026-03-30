const GQL_ENDPOINT = 'https://api.linear.app/graphql'

export interface LinearUser {
  id: string
  name: string
  email: string
  displayName: string
}

export interface LinearTeam {
  id: string
  name: string
  key: string
}

export interface LinearState {
  id: string
  name: string
  type: string // backlog | unstarted | started | completed | cancelled
  color: string
}

export interface LinearProject {
  id: string
  name: string
  description?: string
  state: string
  url: string
}

export interface LinearIssue {
  id: string
  identifier: string // e.g. ENG-123
  title: string
  description?: string
  priority: number // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  state?: LinearState
  team?: LinearTeam
  assignee?: LinearUser
  creator?: LinearUser
  url: string
  createdAt: string
  updatedAt: string
  dueDate?: string
  labels?: { nodes: Array<{ name: string; color: string }> }
}

export interface LinearComment {
  id: string
  body: string
  user?: LinearUser
  createdAt: string
}

const ISSUE_FIELDS = `
  id identifier title description priority url createdAt updatedAt dueDate
  state { id name type color }
  team { id name key }
  assignee { id name email displayName }
  creator { id name displayName }
  labels { nodes { name color } }
`

export class LinearAPI {
  private token = ''

  setToken(token: string): void {
    this.token = token
  }

  private async query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(', '))
    return json.data as T
  }

  async getViewer(): Promise<LinearUser> {
    const data = await this.query<{ viewer: LinearUser }>(`
      query { viewer { id name email displayName } }
    `)
    return data.viewer
  }

  async listTeams(): Promise<LinearTeam[]> {
    const data = await this.query<{ teams: { nodes: LinearTeam[] } }>(`
      query { teams(first: 50) { nodes { id name key } } }
    `)
    return data.teams.nodes
  }

  async listProjects(teamId?: string): Promise<LinearProject[]> {
    const filter = teamId
      ? `(filter: { accessibleTeams: { id: { eq: "${teamId}" } } })`
      : '(first: 50)'
    const data = await this.query<{ projects: { nodes: LinearProject[] } }>(`
      query { projects${filter} { nodes { id name description state url } } }
    `)
    return data.projects.nodes
  }

  async listIssues(
    opts: {
      teamId?: string
      assigneeId?: string
      stateType?: string
      priority?: number
      first?: number
    } = {},
  ): Promise<LinearIssue[]> {
    const filters: string[] = []
    if (opts.teamId) filters.push(`team: { id: { eq: "${opts.teamId}" } }`)
    if (opts.assigneeId) filters.push(`assignee: { id: { eq: "${opts.assigneeId}" } }`)
    if (opts.stateType) filters.push(`state: { type: { eq: "${opts.stateType}" } }`)
    if (opts.priority !== undefined) filters.push(`priority: { eq: ${opts.priority} }`)
    const filterStr = filters.length
      ? `(filter: { ${filters.join(', ')} }, first: ${opts.first ?? 25})`
      : `(first: ${opts.first ?? 25})`
    const data = await this.query<{ issues: { nodes: LinearIssue[] } }>(`
      query { issues${filterStr} { nodes { ${ISSUE_FIELDS} } } }
    `)
    return data.issues.nodes
  }

  async getIssue(id: string): Promise<LinearIssue> {
    const data = await this.query<{ issue: LinearIssue }>(`
      query { issue(id: "${id}") { ${ISSUE_FIELDS} } }
    `)
    return data.issue
  }

  async searchIssues(term: string, first = 20): Promise<LinearIssue[]> {
    const data = await this.query<{ issueSearch: { nodes: LinearIssue[] } }>(
      `query($term: String!, $first: Int) {
        issueSearch(query: $term, first: $first) {
          nodes { id identifier title description priority url createdAt updatedAt
            state { id name type color } team { id name key } assignee { id name displayName }
          }
        }
      }`,
      { term, first },
    )
    return data.issueSearch.nodes
  }

  async createIssue(input: {
    teamId: string
    title: string
    description?: string
    priority?: number
    stateId?: string
    assigneeId?: string
    dueDate?: string
  }): Promise<{ id: string; identifier: string; url: string }> {
    const data = await this.query<{
      issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } }
    }>(
      `mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { id identifier url } }
      }`,
      { input },
    )
    if (!data.issueCreate.success) throw new Error('Failed to create issue')
    return data.issueCreate.issue
  }

  async updateIssue(
    id: string,
    input: Record<string, unknown>,
  ): Promise<{ id: string; identifier: string; url: string }> {
    const data = await this.query<{
      issueUpdate: { success: boolean; issue: { id: string; identifier: string; url: string } }
    }>(
      `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success issue { id identifier url } }
      }`,
      { id, input },
    )
    if (!data.issueUpdate.success) throw new Error('Failed to update issue')
    return data.issueUpdate.issue
  }

  async addComment(issueId: string, body: string): Promise<{ id: string }> {
    const data = await this.query<{ commentCreate: { success: boolean; comment: { id: string } } }>(
      `mutation AddComment($input: CommentCreateInput!) {
        commentCreate(input: $input) { success comment { id } }
      }`,
      { input: { issueId, body } },
    )
    if (!data.commentCreate.success) throw new Error('Failed to add comment')
    return data.commentCreate.comment
  }

  async listComments(issueId: string): Promise<LinearComment[]> {
    const data = await this.query<{ issue: { comments: { nodes: LinearComment[] } } }>(
      `query($id: String!) {
        issue(id: $id) {
          comments(first: 50) { nodes { id body createdAt user { id name displayName } } }
        }
      }`,
      { id: issueId },
    )
    return data.issue.comments.nodes
  }

  async listStates(teamId: string): Promise<LinearState[]> {
    const data = await this.query<{ workflowStates: { nodes: LinearState[] } }>(
      `query($filter: WorkflowStateFilter) {
        workflowStates(filter: $filter, first: 50) { nodes { id name type color } }
      }`,
      { filter: { team: { id: { eq: teamId } } } },
    )
    return data.workflowStates.nodes
  }
}
