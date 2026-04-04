# CRM Field Mapping — Google Sheets

Map lead data to Google Sheet columns in this exact order.

## Column Layout

| Column | Field | Format | Example |
|--------|-------|--------|---------|
| A | Name | Full name | "Sarah Chen" |
| B | Email | Email address | "sarah@acme.com" |
| C | Company | Company name | "Acme Corp" |
| D | Title | Job title | "VP Engineering" |
| E | Score | Number 0-100 | "82" |
| F | Status | One of the status values below | "qualified" |
| G | Source | Lead source | "Typeform - pricing page" |
| H | Researched At | ISO timestamp | "2026-04-03T14:00:00Z" |
| I | Outreach Sent At | ISO timestamp or empty | "2026-04-03T14:05:00Z" |
| J | Notes | Brief research summary + scoring rationale | "B2B SaaS, 50 employees, Series A. VP of Eng, right department. Inbound from pricing form. Score: 82 (company 35, contact 27, intent 20)" |

## Status Values

| Status | Meaning |
|--------|---------|
| `new` | Just discovered, not yet researched |
| `researched` | Research complete, scoring done |
| `qualified` | Score >= threshold, ready for outreach |
| `below_threshold` | Score < threshold, no outreach |
| `outreach_sent` | Personalized email sent |
| `outreach_failed` | Email send failed |
| `replied` | Prospect replied to outreach |
| `converted` | Meeting booked or next step taken |
| `unsubscribed` | Prospect opted out |
| `duplicate` | Already in the system |

## Rules

1. **Never overwrite existing rows.** Always append new leads. Update status in-place for existing leads.
2. **Find existing leads by email (column B).** Search before appending to avoid duplicates.
3. **Always include scoring rationale in Notes.** This helps the user understand and override decisions.
4. **Timestamps in UTC ISO format.** Consistent and sortable.
5. **Keep Notes under 200 characters.** Brief but informative.
