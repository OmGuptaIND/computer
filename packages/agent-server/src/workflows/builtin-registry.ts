/**
 * Builtin Workflow Registry — lists and loads workflows bundled with Anton.
 *
 * Builtin workflows live in src/workflows/builtin/{id}/ and are present
 * on disk in both dev and production (repo-clone deployment model).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkflowManifest, WorkflowRegistryEntry } from '@anton/protocol'

// Resolve the builtin/ directory relative to this module
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const BUILTIN_DIR = join(MODULE_DIR, 'builtin')

/**
 * List all builtin workflows as registry entries (lightweight metadata).
 */
export function listBuiltinWorkflows(): WorkflowRegistryEntry[] {
  if (!existsSync(BUILTIN_DIR)) return []

  const entries: WorkflowRegistryEntry[] = []

  for (const dir of readdirSync(BUILTIN_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue

    const manifestPath = join(BUILTIN_DIR, dir.name, 'workflow.json')
    if (!existsSync(manifestPath)) continue

    try {
      const manifest: WorkflowManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      entries.push({
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        category: manifest.category,
        connectors: [...manifest.connectors.required, ...manifest.connectors.optional],
        runtime: manifest.runtime
          ? { python: manifest.runtime.python, node: manifest.runtime.node }
          : undefined,
        version: manifest.version,
        author: manifest.author,
        featured: true,
      })
    } catch {
      // skip malformed manifests
    }
  }

  return entries
}

/**
 * Get the absolute path to a builtin workflow directory.
 * Returns null if the workflow doesn't exist.
 */
export function getBuiltinWorkflowPath(workflowId: string): string | null {
  const dir = join(BUILTIN_DIR, workflowId)
  if (!existsSync(dir)) return null
  return dir
}

/**
 * Load a builtin workflow manifest.
 */
export function loadBuiltinManifest(workflowId: string): WorkflowManifest | null {
  const dir = getBuiltinWorkflowPath(workflowId)
  if (!dir) return null

  const manifestPath = join(dir, 'workflow.json')
  if (!existsSync(manifestPath)) return null

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return null
  }
}
