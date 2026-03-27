import { Layers } from 'lucide-react'

export function ArtifactEmptyState() {
  return (
    <div className="artifact-empty">
      <Layers size={48} strokeWidth={1} className="artifact-empty__icon" />
      <h3 className="artifact-empty__title">No artifacts yet</h3>
      <p className="artifact-empty__subtitle">
        Artifacts will appear here when the agent creates files, HTML pages, diagrams, or other
        visual content.
      </p>
    </div>
  )
}
