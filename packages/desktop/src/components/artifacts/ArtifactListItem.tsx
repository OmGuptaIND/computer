import { Code2, FileText, GitBranch, Globe, Image } from 'lucide-react'
import type { Artifact, ArtifactRenderType } from '../../lib/artifacts.js'
import { getArtifactTypeLabel } from '../../lib/artifacts.js'

const TYPE_ICONS: Record<ArtifactRenderType, typeof Globe> = {
  html: Globe,
  code: Code2,
  markdown: FileText,
  svg: Image,
  mermaid: GitBranch,
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ArtifactListItem({
  artifact,
  isActive,
  onClick,
}: {
  artifact: Artifact
  isActive: boolean
  onClick: () => void
}) {
  const Icon = TYPE_ICONS[artifact.renderType] || Code2

  return (
    <button
      type="button"
      className={`artifact-list__item ${isActive ? 'artifact-list__item--active' : ''}`}
      onClick={onClick}
    >
      <Icon size={14} strokeWidth={1.5} className="artifact-list__item-icon" />
      <span className="artifact-list__item-title">
        {artifact.title || artifact.filename || 'Untitled'}
      </span>
      <span className="artifact-list__item-badge">{getArtifactTypeLabel(artifact.renderType)}</span>
      {artifact.publishedUrl && <span className="artifact-list__item-published" title="Published" />}
      <span className="artifact-list__item-time">{formatTimestamp(artifact.timestamp)}</span>
    </button>
  )
}
