const BASE = 'https://api.linkedin.com'

export interface LinkedInProfile {
  sub: string
  name: string
  given_name: string
  family_name: string
  email: string
  picture?: string
}

export interface LinkedInOrg {
  id: string
  name: string
  vanityName?: string
}

export interface LinkedInPost {
  id: string
  url?: string
}

export class LinkedInAPI {
  private token = ''

  setToken(token: string): void {
    this.token = token
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`LinkedIn API ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  async getProfile(): Promise<LinkedInProfile> {
    return this.request<LinkedInProfile>('/v2/userinfo')
  }

  /** Create a text post on behalf of the authenticated member. */
  async createPost(authorUrn: string, text: string, visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'): Promise<string> {
    const body = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    }
    const res = await fetch(`${BASE}/v2/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`LinkedIn API ${res.status}: ${text}`)
    }
    const location = res.headers.get('x-restli-id') ?? res.headers.get('location') ?? 'unknown'
    return location
  }

  /** List organizations where the member is an admin. */
  async getAdminOrganizations(): Promise<LinkedInOrg[]> {
    const data = await this.request<{ elements: Array<{ organizationalTarget: string }> }>(
      '/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName,vanityName)))',
    )
    return (data.elements ?? []).map((el: any) => ({
      id: el['organizationalTarget~']?.id?.toString() ?? '',
      name: el['organizationalTarget~']?.localizedName ?? '',
      vanityName: el['organizationalTarget~']?.vanityName,
    }))
  }
}
