import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { type Static, type TSchema, Type } from '@sinclair/typebox'
import { type GoogleCalendarAPI, formatEvent } from './api.js'

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

export function createGoogleCalendarTools(api: GoogleCalendarAPI): AgentTool[] {
  return [
    defineTool({
      name: 'gcal_list_events',
      label: 'List Events',
      description:
        '[Google Calendar] List upcoming events. Defaults to the next 7 days on the primary calendar.',
      parameters: Type.Object({
        calendar_id: Type.Optional(Type.String({ description: 'Calendar ID (default: primary)' })),
        time_min: Type.Optional(
          Type.String({ description: 'Start of range in ISO 8601 (default: now)' }),
        ),
        time_max: Type.Optional(
          Type.String({ description: 'End of range in ISO 8601 (default: 7 days from now)' }),
        ),
        max_results: Type.Optional(
          Type.Number({ description: 'Max events to return (default: 20)' }),
        ),
        query: Type.Optional(Type.String({ description: 'Free-text search within events' })),
      }),
      async execute(_id, params) {
        try {
          const now = new Date()
          const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          const result = await api.listEvents({
            calendarId: params.calendar_id,
            timeMin: params.time_min ?? now.toISOString(),
            timeMax: params.time_max ?? weekLater.toISOString(),
            maxResults: params.max_results ?? 20,
            q: params.query,
          })
          if (!result.items?.length) return toolResult('No events found.')
          return toolResult(JSON.stringify(result.items.map(formatEvent), null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gcal_get_event',
      label: 'Get Event',
      description: '[Google Calendar] Get full details of a specific event.',
      parameters: Type.Object({
        event_id: Type.String({ description: 'Event ID' }),
        calendar_id: Type.Optional(Type.String({ description: 'Calendar ID (default: primary)' })),
      }),
      async execute(_id, params) {
        try {
          const event = await api.getEvent(params.calendar_id ?? 'primary', params.event_id)
          return toolResult(JSON.stringify(formatEvent(event), null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gcal_create_event',
      label: 'Create Event',
      description: '[Google Calendar] Create a new calendar event.',
      parameters: Type.Object({
        title: Type.String({ description: 'Event title' }),
        start: Type.String({
          description:
            'Start time in ISO 8601 (e.g. 2024-03-15T14:00:00+05:30) or date (2024-03-15)',
        }),
        end: Type.String({ description: 'End time in ISO 8601 or date' }),
        description: Type.Optional(Type.String({ description: 'Event description' })),
        location: Type.Optional(Type.String({ description: 'Event location' })),
        attendees: Type.Optional(
          Type.String({ description: 'Comma-separated attendee email addresses' }),
        ),
        calendar_id: Type.Optional(Type.String({ description: 'Calendar ID (default: primary)' })),
        time_zone: Type.Optional(
          Type.String({ description: 'Timezone (e.g. Asia/Kolkata). Defaults to UTC.' }),
        ),
      }),
      async execute(_id, params) {
        try {
          const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(params.start)
          const event: Record<string, unknown> = {
            summary: params.title,
            start: isAllDay
              ? { date: params.start }
              : { dateTime: params.start, timeZone: params.time_zone ?? 'UTC' },
            end: isAllDay
              ? { date: params.end }
              : { dateTime: params.end, timeZone: params.time_zone ?? 'UTC' },
          }
          if (params.description) event.description = params.description
          if (params.location) event.location = params.location
          if (params.attendees) {
            event.attendees = params.attendees.split(',').map((e) => ({ email: e.trim() }))
          }
          const created = await api.createEvent(params.calendar_id ?? 'primary', event)
          return toolResult(`Event created: ${created.summary}\n${created.htmlLink ?? ''}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gcal_update_event',
      label: 'Update Event',
      description: '[Google Calendar] Update an existing calendar event.',
      parameters: Type.Object({
        event_id: Type.String({ description: 'Event ID to update' }),
        calendar_id: Type.Optional(Type.String({ description: 'Calendar ID (default: primary)' })),
        title: Type.Optional(Type.String({ description: 'New title' })),
        start: Type.Optional(Type.String({ description: 'New start time in ISO 8601' })),
        end: Type.Optional(Type.String({ description: 'New end time in ISO 8601' })),
        description: Type.Optional(Type.String({ description: 'New description' })),
        location: Type.Optional(Type.String({ description: 'New location' })),
        time_zone: Type.Optional(Type.String({ description: 'Timezone' })),
      }),
      async execute(_id, params) {
        try {
          const patch: Record<string, unknown> = {}
          if (params.title) patch.summary = params.title
          if (params.description !== undefined) patch.description = params.description
          if (params.location !== undefined) patch.location = params.location
          if (params.start)
            patch.start = { dateTime: params.start, timeZone: params.time_zone ?? 'UTC' }
          if (params.end) patch.end = { dateTime: params.end, timeZone: params.time_zone ?? 'UTC' }
          const updated = await api.updateEvent(
            params.calendar_id ?? 'primary',
            params.event_id,
            patch,
          )
          return toolResult(`Event updated: ${updated.summary}\n${updated.htmlLink ?? ''}`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gcal_delete_event',
      label: 'Delete Event',
      description: '[Google Calendar] Delete a calendar event.',
      parameters: Type.Object({
        event_id: Type.String({ description: 'Event ID to delete' }),
        calendar_id: Type.Optional(Type.String({ description: 'Calendar ID (default: primary)' })),
      }),
      async execute(_id, params) {
        try {
          await api.deleteEvent(params.calendar_id ?? 'primary', params.event_id)
          return toolResult(`Event ${params.event_id} deleted.`)
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),

    defineTool({
      name: 'gcal_list_calendars',
      label: 'List Calendars',
      description: '[Google Calendar] List all calendars in the account.',
      parameters: Type.Object({}),
      async execute(_id, _params) {
        try {
          const result = await api.listCalendars()
          const cals = result.items.map((c) => ({
            id: c.id,
            name: c.summary,
            primary: c.primary ?? false,
            timeZone: c.timeZone,
          }))
          return toolResult(JSON.stringify(cals, null, 2))
        } catch (err) {
          return toolResult(`Error: ${(err as Error).message}`, true)
        }
      },
    }),
  ]
}
