import { Braces, FileCode, Network, Sparkles, SquareCode, X } from 'lucide-react'
import { useState } from 'react'
import type { ArtifactRenderType } from '../../lib/artifacts.js'
import { useStore } from '../../lib/store.js'

const TYPE_ICONS: Record<ArtifactRenderType, typeof Sparkles> = {
  html: Sparkles,
  code: Braces,
  markdown: FileCode,
  svg: SquareCode,
  mermaid: Network,
}

const TYPE_LABELS: Record<ArtifactRenderType, string> = {
  html: 'HTML',
  code: 'Code',
  markdown: 'Markdown',
  svg: 'SVG',
  mermaid: 'Diagram',
}

export function ArtifactRail() {
  const artifacts = useStore((s) => s.artifacts)
  const activeArtifactId = useStore((s) => s.activeArtifactId)
  const setActiveArtifact = useStore((s) => s.setActiveArtifact)
  const setArtifactViewMode = useStore((s) => s.setArtifactViewMode)
  const setSidePanelView = useStore((s) => s.setSidePanelView)
  const setArtifactPanelOpen = useStore((s) => s.setArtifactPanelOpen)
  const [dismissed, setDismissed] = useState(false)

  if (artifacts.length === 0 || dismissed) return null

  const handleClick = (id: string) => {
    setActiveArtifact(id)
    setArtifactViewMode('detail')
    setSidePanelView('artifacts')
    setArtifactPanelOpen(true)
  }

  // Show newest first
  const sorted = [...artifacts].reverse()

  return (
    <div className="artifact-rail">
      <div className="artifact-rail__header">
        <span className="artifact-rail__title">Artifacts</span>
        <span className="artifact-rail__count">{artifacts.length}</span>
        <button
          type="button"
          className="artifact-rail__close"
          onClick={() => setDismissed(true)}
          aria-label="Close artifacts"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      <div className="artifact-rail__items">
        {sorted.map((artifact) => {
          const Icon = TYPE_ICONS[artifact.renderType] || Braces
          const label = TYPE_LABELS[artifact.renderType] || 'File'
          const title = artifact.title || artifact.filename || 'Untitled'
          const isActive = artifact.id === activeArtifactId

          return (
            <button
              key={artifact.id}
              type="button"
              className={`artifact-rail__item${isActive ? ' artifact-rail__item--active' : ''}`}
              onClick={() => handleClick(artifact.id)}
              title={title}
            >
              <Icon size={14} strokeWidth={1.5} className="artifact-rail__item-icon" />
              <span className="artifact-rail__item-title">{title}</span>
              <span className="artifact-rail__item-badge">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
