# Lead Scanner — Task

<user_preferences>
lead_sources: "{{lead_sources}}"
target_sheet: "{{target_sheet}}"
</user_preferences>

<task_steps>
1. Check memory for last scan timestamp. First run = look back 24 hours.
2. Search Gmail for emails from configured lead sources since last scan.
3. For each matching email, extract: name, email, company, source.
4. Check shared state DB for duplicates: `shared_state query "SELECT id FROM leads WHERE email = ?" [email]`
5. Insert new leads: `shared_state execute "INSERT INTO leads (email, name, company, source, status) VALUES (?, ?, ?, ?, 'new')" [...]`
6. Save current timestamp to memory for next run.
7. Report: "Found X new leads from [sources]."
</task_steps>

<rules>
- Only process emails since last scan — never re-process
- Skip duplicates — always check shared state first
- Do NOT score or research — that is the Lead Scorer's job
- Do NOT write to Google Sheets — that is an output destination, not coordination
- Use shared_state for ALL data operations
- Set status to "new" on all inserted leads
</rules>
