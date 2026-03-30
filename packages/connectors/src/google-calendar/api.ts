const BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  status?: string
  htmlLink?: string
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>
  organizer?: { email: string; displayName?: string }
  created?: string
  updated?: string
  recurrence?: string[]
}

export interface Calendar {
  id: string
  summary: string
  description?: string
  primary?: boolean
  timeZone?: string
}

export class GoogleCalendarAPI {
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
        ...options.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Google Calendar API ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  async listCalendars(): Promise<{ items: Calendar[] }> {
    return this.request('/users/me/calendarList')
  }

  async listEvents(
    opts: {
      calendarId?: string
      timeMin?: string
      timeMax?: string
      maxResults?: number
      q?: string
      singleEvents?: boolean
      orderBy?: string
    } = {},
  ): Promise<{ items: CalendarEvent[] }> {
    const calendarId = encodeURIComponent(opts.calendarId ?? 'primary')
    const params = new URLSearchParams()
    if (opts.timeMin) params.set('timeMin', opts.timeMin)
    if (opts.timeMax) params.set('timeMax', opts.timeMax)
    if (opts.maxResults) params.set('maxResults', String(opts.maxResults))
    if (opts.q) params.set('q', opts.q)
    params.set('singleEvents', String(opts.singleEvents ?? true))
    params.set('orderBy', opts.orderBy ?? 'startTime')
    return this.request(`/calendars/${calendarId}/events?${params}`)
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`)
  }

  async createEvent(calendarId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    })
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(event),
    })
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'DELETE',
    })
  }
}

/** Format a CalendarEvent into a readable object */
export function formatEvent(e: CalendarEvent) {
  return {
    id: e.id,
    title: e.summary ?? '(no title)',
    start: e.start.dateTime ?? e.start.date,
    end: e.end.dateTime ?? e.end.date,
    location: e.location ?? null,
    description: e.description ?? null,
    attendees:
      e.attendees?.map((a) => ({
        email: a.email,
        name: a.displayName,
        status: a.responseStatus,
      })) ?? [],
    organizer: e.organizer?.email ?? null,
    status: e.status ?? null,
    link: e.htmlLink ?? null,
  }
}
