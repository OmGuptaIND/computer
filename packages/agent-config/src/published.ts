/**
 * Published artifact metadata index — tracks all published artifacts
 * with view counts, timestamps, and project associations.
 *
 * Stored at ~/.anton/published/index.json alongside the slug directories.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPublishedDir } from './config.js'

export interface PublishedArtifactMeta {
  slug: string
  artifactId?: string
  title: string
  type: 'html' | 'markdown' | 'svg' | 'mermaid' | 'code'
  language?: string
  description?: string
  createdAt: number
  updatedAt: number
  projectId?: string
  views: number
}

function indexPath(): string {
  return join(getPublishedDir(), 'index.json')
}

function loadIndex(): PublishedArtifactMeta[] {
  try {
    const raw = readFileSync(indexPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveIndex(entries: PublishedArtifactMeta[]): void {
  writeFileSync(indexPath(), JSON.stringify(entries, null, 2), 'utf-8')
}

/** List all published artifact metadata entries */
export function listPublished(): PublishedArtifactMeta[] {
  return loadIndex()
}

/** Get a single published artifact by slug */
export function getPublished(slug: string): PublishedArtifactMeta | null {
  return loadIndex().find((e) => e.slug === slug) ?? null
}

/** Upsert published artifact metadata by slug, preserving views and createdAt on re-publish */
export function savePublishedMeta(meta: PublishedArtifactMeta): void {
  const entries = loadIndex()
  const idx = entries.findIndex((e) => e.slug === meta.slug)
  if (idx !== -1) {
    const existing = entries[idx]
    entries[idx] = {
      ...meta,
      createdAt: existing.createdAt,
      views: existing.views,
    }
  } else {
    entries.unshift(meta)
  }
  saveIndex(entries)
}

/** Remove a published artifact and delete its slug directory */
export function removePublished(slug: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return

  const entries = loadIndex().filter((e) => e.slug !== slug)
  saveIndex(entries)

  const slugDir = join(getPublishedDir(), slug)
  if (existsSync(slugDir)) {
    rmSync(slugDir, { recursive: true, force: true })
  }
}

/** Increment view counter for a published artifact */
export function incrementViews(slug: string): void {
  const entries = loadIndex()
  const entry = entries.find((e) => e.slug === slug)
  if (entry) {
    entry.views++
    entry.updatedAt = Date.now()
    saveIndex(entries)
  }
}
