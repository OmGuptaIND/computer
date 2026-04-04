import { artifactStore } from '../../lib/store/artifactStore.js'
import { ArtifactDetailView } from './ArtifactDetailView.js'
import { ArtifactEmptyState } from './ArtifactEmptyState.js'
import { ArtifactListView } from './ArtifactListView.js'

// ── Artifact panel content (used inside SidePanel) ────────────────

export function ArtifactPanelContent() {
  const artifacts = artifactStore((s) => s.artifacts)
  const viewMode = artifactStore((s) => s.artifactViewMode)

  if (artifacts.length === 0) {
    return <ArtifactEmptyState />
  }

  if (viewMode === 'detail') {
    return <ArtifactDetailView />
  }

  return <ArtifactListView />
}
