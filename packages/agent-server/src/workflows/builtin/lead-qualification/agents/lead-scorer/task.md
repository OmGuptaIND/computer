# Lead Scorer — Task

<user_preferences>
icp_description: "{{icp_description}}"
score_threshold: {{score_threshold}}
target_sheet: "{{target_sheet}}"
apollo_api_key: "{{apollo_api_key}}"
</user_preferences>

<task_steps>
1. Query shared state for new leads: `shared_state query "SELECT * FROM leads WHERE status = 'new'"`
2. If no results, report "No new leads to score" and exit.
3. For each lead:
   a. Research: company info, title, seniority, online presence. Use Exa search.
   b. If Apollo API key configured, run: `python3 {{workflow_dir}}/scripts/enrich-lead.py --email <email>`
   c. Score against ICP using @scoring-rubric.md:
      - Company Fit (max 40): industry match (0-15), size match (0-15), tech fit (0-10)
      - Contact Fit (max 30): decision-maker level (3-15), department relevance (0-15)
      - Intent Signals (max 30): inbound (15), demo/pricing form (+5), recent activity (0-10), content engagement (0-5)
   d. Update shared state: `shared_state execute "UPDATE leads SET score = ?, status = 'scored', title = ?, research = ?, notes = ?, updated_at = datetime('now') WHERE id = ?" [...]`
4. Sync scored leads to Google Sheets at target_sheet (output only).
5. Report: "Scored X leads: Y hot, Z warm, W not a fit."
</task_steps>

<rules>
- Only process leads with status = "new" — system rejects other transitions
- Be conservative — when uncertain, score lower
- Never inflate scores — missing data = lower score on that dimension
- Document scoring reasoning in notes field
- Use shared_state for ALL reads/writes — Google Sheets is output only
- Learn from memory — apply any scoring adjustments from previous runs
</rules>
