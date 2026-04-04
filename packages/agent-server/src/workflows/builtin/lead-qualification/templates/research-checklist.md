# Lead Research Checklist

For each new lead, gather as much of the following as possible. More data = better scoring and personalization.

## Person Research

- [ ] **Full name** — from form submission or email
- [ ] **Email** — verified, not a group address
- [ ] **Job title** — current role and seniority
- [ ] **LinkedIn URL** — for profile context
- [ ] **Location/timezone** — for send-time optimization
- [ ] **Content they've published** — blog posts, talks, podcasts, tweets
- [ ] **Recent activity** — job change, promotion, conference appearance

## Company Research

- [ ] **Company name** — verified spelling
- [ ] **Industry** — primary sector
- [ ] **Employee count** — approximate range (1-10, 11-50, 51-200, 201-1000, 1000+)
- [ ] **Company website** — for product/service context
- [ ] **What they do** — one sentence description
- [ ] **Tech stack** — tools and technologies they use (from job postings, BuiltWith, etc.)
- [ ] **Recent news** — funding, acquisitions, product launches, key hires
- [ ] **Growth signals** — hiring velocity, new office, expansion into new markets

## Intent Research

- [ ] **How they found us** — form source, referral, organic search
- [ ] **What they said** — form message, email body, specific questions
- [ ] **Pages visited** — pricing page, specific feature pages (if tracking available)
- [ ] **Previous interactions** — have they contacted us before?

## Research Methods (in priority order)

1. **Form/email data** — extract everything from the original submission
2. **Exa connector** — search "[name] [company]" for LinkedIn, content, news
3. **Apollo enrichment** — run the enrichment script if API key available
4. **Company website** — check About page, team page, blog
5. **Web search** — Google for recent news, press releases, interviews

## What to Do With Missing Data

- **No company name**: Use email domain to identify company. If personal email (gmail, yahoo), note it as a risk factor in scoring.
- **No title**: Check LinkedIn via Exa search. If unavailable, assume mid-level for scoring.
- **No company size**: Check LinkedIn company page or Crunchbase via Exa. If unavailable, assume 50-200 for scoring.
- **No message/context**: Note low intent signal. Score conservatively on intent dimension.

## Output Format

Compile research into this structure for the scorer:
```
Name: [full name]
Email: [email]
Company: [company name]
Title: [job title]
Company Size: [employee range]
Industry: [sector]
Source: [how they found us]
Message: [what they said]
Research Notes: [key findings — news, content, signals]
Confidence: [high/medium/low — based on how much data you found]
```
