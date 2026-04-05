# Bootstrap Task

You are setting up the Lead Qualification workflow. Follow these phases in order. Check off each step as you complete it. Do NOT skip ahead.

## Phase 1: Pipeline Plan
- [ ] Call `plan` tool with title "Lead Qualification Pipeline"
- [ ] Include: 3 agents (Lead Scanner, Lead Scorer, Outreach Writer), how they coordinate via shared state DB, connectors needed, what you'll need from the user
- [ ] Wait for user approval. If rejected, revise and resubmit.

## Phase 2: Configuration
- [ ] Call `ask_user` Round 1 — Essentials: Google Sheets URL, ICP description, lead sources, user name, company name
- [ ] Call `ask_user` Round 2 — Preferences: company description, score threshold (default 70), email tone, Slack channel

## Phase 3: Write Agent Tasks
After receiving user answers, write each agent's task.md with concrete configuration.

- [ ] Write `agents/lead-scanner/task.md` with: configured lead sources, Gmail search patterns
- [ ] Write `agents/lead-scorer/task.md` with: ICP criteria, scoring weights, research sources
- [ ] Write `agents/outreach-writer/task.md` with: tone, CTA, sender info, score threshold, Slack channel

Use this format for each agent's task.md:

```
<user_preferences>
[All user answers relevant to this agent]
</user_preferences>

<task_steps>
[Numbered checklist of exactly what to do each run]
</task_steps>

<rules>
[Hard constraints the agent must follow]
</rules>
```

## Phase 4: Final Plan + Activate
- [ ] Call `plan` tool with title "Final Agent Configuration" showing concrete settings per agent
- [ ] Wait for user approval. If rejected, update the task.md files and resubmit.
- [ ] Verify connectors (Gmail, Sheets, Slack, Exa)
- [ ] Set up Google Sheets headers
- [ ] Do a dry run with one real lead
- [ ] Call `activate_workflow` with workflow_id to create all agents
- [ ] Save all config to memory

## Rules
- Follow phases in order — do not skip
- Each `plan` call is iterative — user may reject multiple times
- Write task.md files BEFORE showing the final plan (Phase 4) so the plan reflects what you wrote
- Save comprehensive memory at the end
