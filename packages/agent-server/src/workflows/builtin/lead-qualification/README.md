# LinkedIn Lead Qualification

Score incoming leads from email and web forms, research prospects deeply, and auto-send personalized outreach to qualified leads.

## What It Does

1. **Monitors Gmail** for new form submissions and inquiries
2. **Researches each lead** using Exa search and optional Apollo.io enrichment
3. **Scores against your ICP** using a weighted rubric (company fit, contact fit, intent signals)
4. **Tracks everything** in a Google Sheet with full audit trail
5. **Sends personalized outreach** to qualified leads — every email is unique
6. **Alerts your team** on Slack when hot leads come in

## Setup

The bootstrap agent will guide you through:
- Defining your ideal customer profile
- Setting up your tracking sheet
- Configuring your outreach style
- Running a test with a real lead

## Connectors Needed

- **Gmail** (required) — read incoming leads, send outreach
- **Google Sheets** (required) — track lead pipeline
- **Slack** (optional) — team alerts for qualified leads
- **Exa** (optional) — deep web research on prospects

## How Scoring Works

Each lead is scored 0-100 across three dimensions:
- **Company Fit (40 pts)**: industry, size, and tech stack match
- **Contact Fit (30 pts)**: seniority level and department relevance
- **Intent Signals (30 pts)**: how they found you and what they did

Leads scoring above your threshold (default: 70) get personalized outreach automatically.
