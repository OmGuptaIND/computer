/**
 * Skills system — add new capabilities to the agent via simple config.
 *
 * A skill is a persona + prompt + optional schedule. Examples:
 * - AI CMO: monitors social media, drafts content, manages campaigns
 * - AI Content Writer: writes blog posts, tweets, newsletters
 * - AI DevOps: monitors servers, deploys code, handles incidents
 * - AI Researcher: searches the web, summarizes findings, creates reports
 *
 * Skills can run:
 * 1. On-demand: user triggers via desktop app
 * 2. Scheduled: runs on cron (24/7 autonomous work)
 * 3. Event-driven: triggered by file changes, webhooks, etc. (v0.2)
 *
 * Adding a new skill is as simple as adding a YAML file to ~/.anton/skills/
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { SkillConfig } from './config.js'
import { getAntonDir } from './config.js'

const SKILLS_DIR = join(getAntonDir(), 'skills')

export function loadSkills(): SkillConfig[] {
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true })
    // Create example skills on first run
    createExampleSkills()
  }

  const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  const skills: SkillConfig[] = []

  for (const file of files) {
    try {
      const raw = readFileSync(join(SKILLS_DIR, file), 'utf-8')
      const skill = parseYaml(raw) as SkillConfig
      skills.push(skill)
    } catch (err) {
      console.error(`Failed to load skill ${file}:`, err)
    }
  }

  return skills
}

function createExampleSkills() {
  const examples: Record<string, SkillConfig> = {
    'content-writer.yaml': {
      name: 'AI Content Writer',
      description: 'Writes blog posts, social media content, and newsletters',
      prompt: `You are a content writer. When activated, you:
1. Check ~/content/drafts/ for any content briefs
2. Research the topic using the browser tool
3. Write the content in markdown format
4. Save to ~/content/published/
5. Report what you wrote and where it's saved

Write in a clear, engaging style. Include headers, bullet points, and relevant examples.
Optimize for readability and SEO when applicable.`,
      tools: ['shell', 'filesystem', 'browser'],
    },

    'server-monitor.yaml': {
      name: 'Server Monitor',
      description: 'Monitors server health and alerts on issues',
      prompt: `You are a server monitor. When activated, you:
1. Check disk usage (df -h)
2. Check memory usage (free -m)
3. Check CPU load (uptime)
4. Check running services (systemctl list-units --state=running)
5. Check for failed services (systemctl --failed)
6. Check recent error logs (journalctl -p err --since "1 hour ago")
7. Report any issues found

If everything is healthy, give a brief "all clear" summary.
If there are issues, explain what's wrong and suggest fixes.`,
      schedule: '0 */6 * * *', // Every 6 hours
      tools: ['shell', 'filesystem'],
    },

    'deployer.yaml': {
      name: 'AI Deployer',
      description: 'Deploys code from git repos with zero-downtime',
      prompt: `You are a deployment agent. When asked to deploy:
1. Pull the latest code from the specified git repo
2. Install dependencies
3. Run tests if they exist
4. Build the project
5. Deploy with zero-downtime (restart services, swap symlinks, etc.)
6. Verify the deployment is working (health checks)
7. Report the result

If any step fails, roll back and report the error.`,
      tools: ['shell', 'filesystem', 'network'],
    },
  }

  for (const [filename, skill] of Object.entries(examples)) {
    const path = join(SKILLS_DIR, filename)
    if (!existsSync(path)) {
      writeFileSync(path, stringifyYaml(skill), 'utf-8')
    }
  }
}

/**
 * Build a skill activation prompt.
 * This turns a generic agent into a specialized worker.
 */
export function buildSkillPrompt(skill: SkillConfig, userMessage?: string): string {
  let prompt = `[SKILL ACTIVATED: ${skill.name}]\n\n`
  prompt += skill.prompt
  if (userMessage) {
    prompt += `\n\n[USER REQUEST]: ${userMessage}`
  }
  return prompt
}
