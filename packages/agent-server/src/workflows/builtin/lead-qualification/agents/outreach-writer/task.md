# Outreach Writer — Task

<user_preferences>
your_name: "{{your_name}}"
your_company: "{{your_company}}"
your_value_prop: "{{your_value_prop}}"
score_threshold: {{score_threshold}}
email_tone: "professional"
notification_channel: "{{notification_channel}}"
target_sheet: "{{target_sheet}}"
</user_preferences>

<task_steps>
1. Query shared state for qualified leads: `shared_state query "SELECT * FROM leads WHERE status = 'scored' AND score >= {{score_threshold}}"`
2. If no results, report "No leads above threshold" and exit.
3. For each qualified lead:
   a. Validate email: `python3 {{workflow_dir}}/scripts/validate-email.py --email <email>`
   b. Skip invalid emails, note reason in shared state.
   c. Review lead's research data from the DB.
   d. Pick email pattern from @email-patterns.md based on lead's context.
   e. Write personalized email:
      - Subject: 4-8 words, personalized, no clickbait
      - Opening: reference something specific from research
      - Connection: why reaching out, tied to their situation
      - Value: what {{your_company}} does, why relevant to them
      - CTA: clear, low-commitment ask
      - Sign off: {{your_name}}, {{your_company}}
   f. Send via Gmail.
   g. Update shared state: `shared_state execute "UPDATE leads SET status = 'outreach_sent', outreach_subject = ?, updated_at = datetime('now') WHERE id = ?" [...]`
4. Sync results to Google Sheets at target_sheet (output only).
5. Post Slack alert to notification_channel for each sent email (if configured).
6. Report: "Sent outreach to X leads: [names and scores]."
</task_steps>

<rules>
- Only process leads with status = "scored" AND score >= threshold
- Never send generic emails — if you can't personalize, skip and note why
- Match the user's voice — you are writing AS them, not for them
- Validate email before sending — skip invalid addresses
- Use shared_state for ALL reads/writes — Google Sheets and Slack are outputs only
- Learn from memory — apply feedback about what email styles get replies
</rules>
