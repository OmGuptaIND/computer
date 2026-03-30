/**
 * Typed GitHub REST API client.
 */

const BASE_URL = 'https://api.github.com'

export class GitHubAPI {
  private token = ''

  setToken(token: string) {
    this.token = token
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`GitHub API ${method} ${path}: ${res.status} ${errText}`)
    }

    if (res.status === 204) return {} as T
    return (await res.json()) as T
  }

  // ── User ──

  async getAuthenticatedUser(): Promise<{ login: string; name: string; email: string }> {
    // Try OAuth user token first (most common), fall back to GitHub App token
    try {
      return await this.request<{ login: string; name: string; email: string }>('GET', '/user')
    } catch {
      // Fall back to GitHub App installation token endpoint
      const app = await this.request<{ slug: string; name: string }>('GET', '/app')
      return { login: app.slug ?? app.name, name: app.name, email: '' }
    }
  }

  // ── Repos ──

  async listRepos(opts: { sort?: string; per_page?: number; page?: number } = {}): Promise<
    Array<{
      full_name: string
      description: string | null
      private: boolean
      language: string | null
      stargazers_count: number
      updated_at: string
    }>
  > {
    const params = new URLSearchParams({
      per_page: String(opts.per_page || 30),
      page: String(opts.page || 1),
    })
    // GitHub App installation tokens — only repos granted during install
    const data = await this.request<{
      repositories: Array<{
        full_name: string
        description: string | null
        private: boolean
        language: string | null
        stargazers_count: number
        updated_at: string
      }>
    }>('GET', `/installation/repositories?${params}`)
    return data.repositories ?? []
  }

  async getRepo(
    owner: string,
    repo: string,
  ): Promise<{
    full_name: string
    description: string | null
    private: boolean
    language: string | null
    default_branch: string
    stargazers_count: number
    open_issues_count: number
  }> {
    return this.request('GET', `/repos/${owner}/${repo}`)
  }

  // ── Issues ──

  async listIssues(
    owner: string,
    repo: string,
    opts: { state?: string; labels?: string; per_page?: number } = {},
  ): Promise<
    Array<{
      number: number
      title: string
      state: string
      user: { login: string }
      labels: Array<{ name: string }>
      created_at: string
      body: string | null
    }>
  > {
    const params = new URLSearchParams({
      state: opts.state || 'open',
      per_page: String(opts.per_page || 30),
    })
    if (opts.labels) params.set('labels', opts.labels)
    return this.request('GET', `/repos/${owner}/${repo}/issues?${params}`)
  }

  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[],
  ): Promise<{ number: number; html_url: string }> {
    return this.request('POST', `/repos/${owner}/${repo}/issues`, {
      title,
      ...(body ? { body } : {}),
      ...(labels?.length ? { labels } : {}),
    })
  }

  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<{
    number: number
    title: string
    state: string
    body: string | null
    user: { login: string }
    labels: Array<{ name: string }>
    comments: number
    html_url: string
  }> {
    return this.request('GET', `/repos/${owner}/${repo}/issues/${issueNumber}`)
  }

  async addComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<{ id: number; html_url: string }> {
    return this.request('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body })
  }

  // ── Pull Requests ──

  async listPullRequests(
    owner: string,
    repo: string,
    opts: { state?: string; per_page?: number } = {},
  ): Promise<
    Array<{
      number: number
      title: string
      state: string
      user: { login: string }
      head: { ref: string }
      base: { ref: string }
      created_at: string
      draft: boolean
    }>
  > {
    const params = new URLSearchParams({
      state: opts.state || 'open',
      per_page: String(opts.per_page || 30),
    })
    return this.request('GET', `/repos/${owner}/${repo}/pulls?${params}`)
  }

  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{
    number: number
    title: string
    body: string | null
    state: string
    user: { login: string }
    head: { ref: string }
    base: { ref: string }
    mergeable: boolean | null
    additions: number
    deletions: number
    changed_files: number
    html_url: string
  }> {
    return this.request('GET', `/repos/${owner}/${repo}/pulls/${prNumber}`)
  }

  // ── Search ──

  async searchCode(
    query: string,
    opts: { per_page?: number } = {},
  ): Promise<{
    total_count: number
    items: Array<{
      name: string
      path: string
      repository: { full_name: string }
      html_url: string
    }>
  }> {
    const params = new URLSearchParams({
      q: query,
      per_page: String(opts.per_page || 20),
    })
    return this.request('GET', `/search/code?${params}`)
  }

  async searchIssues(
    query: string,
    opts: { per_page?: number } = {},
  ): Promise<{
    total_count: number
    items: Array<{
      number: number
      title: string
      state: string
      repository_url: string
      html_url: string
      body: string | null
    }>
  }> {
    const params = new URLSearchParams({
      q: query,
      per_page: String(opts.per_page || 20),
    })
    return this.request('GET', `/search/issues?${params}`)
  }

  // ── File contents ──

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<{ content: string; encoding: string; sha: string }> {
    const params = ref ? `?ref=${ref}` : ''
    return this.request('GET', `/repos/${owner}/${repo}/contents/${path}${params}`)
  }

  // ── Branches ──

  async getBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<{
    name: string
    commit: { sha: string; url: string }
    protected: boolean
  }> {
    return this.request('GET', `/repos/${owner}/${repo}/branches/${branch}`)
  }

  async createBranch(
    owner: string,
    repo: string,
    branch: string,
    fromSha: string,
  ): Promise<{ ref: string; object: { sha: string } }> {
    return this.request('POST', `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: fromSha,
    })
  }

  // ── File mutations ──

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    content: string,
    opts: { branch?: string; sha?: string } = {},
  ): Promise<{
    content: { path: string; sha: string; html_url: string }
    commit: { sha: string; html_url: string }
  }> {
    return this.request('PUT', `/repos/${owner}/${repo}/contents/${path}`, {
      message,
      content, // must be base64 encoded
      ...(opts.branch ? { branch: opts.branch } : {}),
      ...(opts.sha ? { sha: opts.sha } : {}),
    })
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    opts: { branch?: string } = {},
  ): Promise<{ commit: { sha: string; html_url: string } }> {
    return this.request('DELETE', `/repos/${owner}/${repo}/contents/${path}`, {
      message,
      sha,
      ...(opts.branch ? { branch: opts.branch } : {}),
    })
  }

  // ── Pull Requests (write) ──

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    opts: { body?: string; draft?: boolean } = {},
  ): Promise<{ number: number; html_url: string; state: string }> {
    return this.request('POST', `/repos/${owner}/${repo}/pulls`, {
      title,
      head,
      base,
      ...(opts.body ? { body: opts.body } : {}),
      ...(opts.draft !== undefined ? { draft: opts.draft } : {}),
    })
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    opts: { merge_method?: 'merge' | 'squash' | 'rebase'; commit_title?: string } = {},
  ): Promise<{ sha: string; merged: boolean; message: string }> {
    return this.request('PUT', `/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
      ...(opts.merge_method ? { merge_method: opts.merge_method } : {}),
      ...(opts.commit_title ? { commit_title: opts.commit_title } : {}),
    })
  }
}
