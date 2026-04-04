# Lead Scoring Rubric

Score each lead 0-100 based on three weighted dimensions.

## Dimension 1: Company Fit (40 points max)

| Criteria | Points | How to Evaluate |
|----------|--------|-----------------|
| **Industry match** | 0-15 | Does their industry match the ICP? Exact match = 15, adjacent = 8, unrelated = 0 |
| **Company size** | 0-15 | Does employee count match ICP range? Within range = 15, close = 8, way off = 0 |
| **Technology fit** | 0-10 | Do they use tools/tech that suggest they need our product? Strong signals = 10, some = 5, none = 0 |

**Tips:**
- Check company website for employee count, industry, and tech stack
- LinkedIn company page shows employee range
- Job postings reveal tech stack and priorities
- If no company data available, score 15/40 (assume average)

## Dimension 2: Contact Fit (30 points max)

| Criteria | Points | How to Evaluate |
|----------|--------|-----------------|
| **Decision-maker level** | 0-15 | VP/C-level/Founder = 15, Director = 12, Senior Manager = 10, Manager = 8, IC = 3 |
| **Department match** | 0-15 | Right department per ICP = 15, adjacent department = 8, unrelated = 0 |

**Tips:**
- Title inflation is common at small companies — "VP" at a 5-person startup ≠ VP at a 500-person company
- Adjust seniority score for company size: IC at a 5-person startup may be a decision-maker
- If title unknown, score 10/30 (assume mid-level)

## Dimension 3: Intent Signals (30 points max)

| Criteria | Points | How to Evaluate |
|----------|--------|-----------------|
| **Inbound contact** | 0-15 | Filled demo/pricing form = 15, contact form = 12, email inquiry = 10, referred = 8, cold = 0 |
| **Company activity** | 0-10 | Recent funding = 8, hiring for relevant role = 7, product launch = 5, no signals = 0 |
| **Content engagement** | 0-5 | Downloaded resource = 5, attended webinar = 4, visited pricing = 3, none = 0 |

**Tips:**
- Inbound is the strongest signal — someone who reached out is 10x more likely to convert
- Recent funding means they have budget
- Hiring for the role your product serves means they have the problem

## Score Interpretation

| Range | Label | Action |
|-------|-------|--------|
| **80-100** | Hot | Send outreach immediately. High-priority follow up. Alert team on Slack. |
| **60-79** | Warm | Send outreach, standard priority. Track in sheet. |
| **40-59** | Cool | Log in sheet, no outreach yet. May revisit if they show more intent. |
| **0-39** | Skip | Log in sheet as "not a fit." No outreach. |

## Scoring Edge Cases

- **Personal email (gmail, yahoo, etc.)**: Deduct 5 points from company fit (can't verify company)
- **No message/context**: Deduct 5 points from intent (low effort signal)
- **Multiple form submissions**: Add 5 bonus points (shows strong intent)
- **Employee at a competitor**: Score 0, flag in notes
- **Student/intern**: Score 0 unless ICP specifically targets early-career
