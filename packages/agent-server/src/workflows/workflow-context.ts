/**
 * Workflow Context Builder — assembles the rich system prompt for workflow agents.
 *
 * When a workflow agent runs, instead of flat `agentInstructions`, the agent gets:
 * - Orchestrator prompt (main agent .md)
 * - Sub-agent prompts (loaded as reference sections)
 * - Template/resource files (rubrics, patterns, checklists)
 * - User config (merged with defaults, variables substituted)
 * - Workflow metadata (paths to scripts, workflow dir)
 *
 * All assembled into a single instructions string + memory.
 */

import {
  getWorkflowDir,
  loadWorkflowManifest,
  loadWorkflowMemory,
  loadWorkflowResource,
  loadWorkflowUserConfig,
} from '@anton/agent-config'
import type { WorkflowManifest, WorkflowSharedState } from '@anton/protocol'

export interface WorkflowContext {
  /** Assembled system prompt with all workflow content */
  instructions: string
  /** Persistent memory from previous runs (state/memory.md) */
  memory: string | null
}

/**
 * Build the agent context for a workflow run.
 *
 * @param agentKey - If provided, loads only this specific agent's prompt + shared config.
 *                   If omitted, loads everything concatenated (backward compat).
 */
export function buildWorkflowAgentContext(
  projectId: string,
  workflowId: string,
  agentKey?: string,
): WorkflowContext | null {
  const manifest = loadWorkflowManifest(projectId, workflowId)
  if (!manifest) return null

  const workflowDir = getWorkflowDir(projectId, workflowId)
  const config = loadMergedConfig(projectId, workflowId)
  const sections: string[] = []

  // ── 1. Workflow metadata header ──────────────────────────────────
  sections.push(buildMetadataHeader(manifest, workflowDir))

  // ── 2. Shared state rules (auto-generated from manifest) ─────────
  if (agentKey && manifest.sharedState) {
    const sharedStateSection = buildSharedStateRules(manifest.sharedState, agentKey)
    if (sharedStateSection) sections.push(sharedStateSection)
  }

  if (agentKey) {
    // ── Per-agent mode ────────────────────────────────────────────

    // Load task.md first — this is the PRIMARY instruction (WHAT to do)
    const taskPath = `agents/${agentKey}/task.md`
    const taskContent = loadWorkflowResource(projectId, workflowId, taskPath)
    if (taskContent) {
      sections.push(
        `\n---\n## YOUR TASK\n\nFollow this task specification exactly. Do not deviate.\n\n${substituteVariables(taskContent, config, workflowDir)}`,
      )
    }

    // Load the agent prompt — this is the process guide (HOW to do it)
    const agentRef = manifest.agents[agentKey]
    if (agentRef) {
      const content = loadWorkflowResource(projectId, workflowId, agentRef.file)
      if (content) {
        sections.push(
          `\n---\n## PROCESS GUIDE\n\n${substituteVariables(content, config, workflowDir)}`,
        )
      }

      // Load only this agent's scripts
      const agentScripts = buildAgentScriptsSection(agentRef.scripts, workflowDir)
      if (agentScripts) sections.push(agentScripts)
    }

    // Load shared resources/templates
    for (const resourcePath of manifest.resources) {
      const content = loadWorkflowResource(projectId, workflowId, resourcePath)
      if (content) {
        const filename = resourcePath.split('/').pop() || resourcePath
        sections.push(
          `\n---\n## Reference: ${filename}\n\n${substituteVariables(content, config, workflowDir)}`,
        )
      }
    }
  } else {
    // ── Legacy mode: concatenate everything ────────────────────────
    const mainAgent = Object.entries(manifest.agents).find(([, ref]) => ref.role === 'main')
    if (mainAgent) {
      const [, ref] = mainAgent
      const content = loadWorkflowResource(projectId, workflowId, ref.file)
      if (content) {
        sections.push(substituteVariables(content, config, workflowDir))
      }
    }

    for (const [name, ref] of Object.entries(manifest.agents)) {
      if (ref.role === 'sub') {
        const content = loadWorkflowResource(projectId, workflowId, ref.file)
        if (content) {
          sections.push(
            `\n---\n## Sub-Agent Module: ${name}\n\n${substituteVariables(content, config, workflowDir)}`,
          )
        }
      }
    }

    for (const resourcePath of manifest.resources) {
      const content = loadWorkflowResource(projectId, workflowId, resourcePath)
      if (content) {
        const filename = resourcePath.split('/').pop() || resourcePath
        sections.push(
          `\n---\n## Reference: ${filename}\n\n${substituteVariables(content, config, workflowDir)}`,
        )
      }
    }

    const scriptsSection = buildScriptsSection(manifest, workflowDir)
    if (scriptsSection) sections.push(scriptsSection)
  }

  const instructions = sections.join('\n\n')
  const memory = loadWorkflowMemory(projectId, workflowId)

  return { instructions, memory }
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildMetadataHeader(manifest: WorkflowManifest, workflowDir: string): string {
  return [
    `# Workflow: ${manifest.name}`,
    '',
    `> ${manifest.description}`,
    '',
    `**Workflow directory:** ${workflowDir}`,
    `**Scripts directory:** ${workflowDir}/scripts/`,
    `**Version:** ${manifest.version}`,
    '',
    'You are a workflow agent. Follow the orchestrator instructions below precisely.',
    'You have access to connector tools (Gmail, Sheets, Slack, Exa) and can run code via the shell tool.',
    'Scripts are pre-written in the scripts/ directory — use them. You can also write new code as needed.',
  ].join('\n')
}

function loadMergedConfig(projectId: string, workflowId: string): Record<string, string> {
  // Load defaults
  const defaultsRaw = loadWorkflowResource(projectId, workflowId, 'config/defaults.json')
  let defaults: Record<string, unknown> = {}
  if (defaultsRaw) {
    try {
      defaults = JSON.parse(defaultsRaw)
    } catch {
      // ignore parse errors
    }
  }

  // Load user config (overrides defaults)
  const userConfig = loadWorkflowUserConfig(projectId, workflowId) || {}

  // Merge: user config takes priority
  const merged = { ...defaults, ...userConfig }

  // Convert all values to strings for substitution
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined) {
      result[key] = ''
    } else if (typeof value === 'object') {
      result[key] = JSON.stringify(value)
    } else {
      result[key] = String(value)
    }
  }

  return result
}

function substituteVariables(
  content: string,
  config: Record<string, string>,
  workflowDir: string,
): string {
  let result = content

  // Substitute {{variable}} placeholders
  for (const [key, value] of Object.entries(config)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }

  // Always substitute workflow_dir
  result = result.replaceAll('{{workflow_dir}}', workflowDir)

  return result
}

function buildAgentScriptsSection(
  scripts: string[] | undefined,
  workflowDir: string,
): string | null {
  if (!scripts || scripts.length === 0) return null

  const lines = [
    '\n---\n## Available Scripts',
    '',
    'These scripts are pre-written and tested. Run them via the shell tool.',
    '',
  ]

  for (const script of scripts) {
    const fullPath = `${workflowDir}/${script}`
    lines.push(`- \`python3 ${fullPath}\` — ${script.split('/').pop()}`)
  }

  return lines.join('\n')
}

function buildScriptsSection(manifest: WorkflowManifest, workflowDir: string): string | null {
  // Collect all script paths from agent refs
  const scripts = new Set<string>()
  for (const ref of Object.values(manifest.agents)) {
    if (ref.scripts) {
      for (const s of ref.scripts) scripts.add(s)
    }
  }

  if (scripts.size === 0) return null

  const lines = [
    '\n---\n## Available Scripts',
    '',
    'These scripts are pre-written and tested. Run them via the shell tool.',
    '',
  ]

  for (const script of scripts) {
    const fullPath = `${workflowDir}/${script}`
    lines.push(`- \`python3 ${fullPath}\` — ${script.split('/').pop()}`)
  }

  lines.push('')
  lines.push(
    `You can also write new scripts as needed. Save them to ${workflowDir}/scripts/ for reuse.`,
  )

  return lines.join('\n')
}

function buildSharedStateRules(sharedState: WorkflowSharedState, agentKey: string): string | null {
  const transition = sharedState.transitions[agentKey]
  if (!transition) return null

  const lines = [
    '\n---',
    '## SHARED STATE — MANDATORY RULES',
    '',
    `This workflow uses a shared SQLite database ("${sharedState.name}") for agent coordination.`,
    'You MUST use the `shared_state` tool for ALL pipeline data operations.',
    '',
    '### Rules',
    '- **DO NOT** store pipeline data in files, memory, or external services',
    '- **DO NOT** use Google Sheets or other connectors for coordination — only for final output',
    '- The shared state database is your **single source of truth**',
    '- Status transitions are **enforced by the system** — invalid transitions will be rejected',
    '',
    '### Your Allowed Operations',
  ]

  if (transition.from === null) {
    lines.push(`- You **INSERT** new items with status = "${transition.to}"`)
    lines.push(
      `- Use: \`shared_state execute "INSERT INTO ${sharedState.name} (column1, ...) VALUES (?, ...)" [params]\``,
    )
  } else {
    lines.push(`- You **READ** items where status = "${transition.from}"`)
    lines.push(`- You **UPDATE** items from status "${transition.from}" → "${transition.to}"`)
    lines.push(
      `- Use: \`shared_state query "SELECT * FROM ${sharedState.name} WHERE status = '${transition.from}'"\``,
    )
    lines.push(
      `- Use: \`shared_state execute "UPDATE ${sharedState.name} SET status = '${transition.to}', ... WHERE id = ?" [id]\``,
    )
  }

  lines.push('')
  lines.push('### What Happens If You Break the Rules')
  lines.push(`- Setting status to anything other than "${transition.to}" → REJECTED`)
  if (transition.from !== null) {
    lines.push('- Trying to INSERT new items → REJECTED (only agents with from=null can insert)')
  }
  lines.push('- All transitions are logged in the `state_log` table for audit')

  return lines.join('\n')
}
