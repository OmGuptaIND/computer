import { useStore } from '../../lib/store.js'
import { ArtifactDetailView } from './ArtifactDetailView.js'
import { ArtifactEmptyState } from './ArtifactEmptyState.js'
import { ArtifactListView } from './ArtifactListView.js'

// ── Artifact panel content (used inside SidePanel) ────────────────

export function ArtifactPanelContent() {
  const artifacts = useStore((s) => s.artifacts)
  const viewMode = useStore((s) => s.artifactViewMode)

  if (artifacts.length === 0) {
    return <ArtifactEmptyState />
  }

  if (viewMode === 'detail') {
    return <ArtifactDetailView />
  }

  return <ArtifactListView />
}
