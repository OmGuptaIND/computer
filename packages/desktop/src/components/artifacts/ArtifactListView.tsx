import { Search } from 'lucide-react'
import { useMemo } from 'react'
import type { ArtifactRenderType } from '../../lib/artifacts.js'
import { useStore } from '../../lib/store.js'
import { ArtifactListItem } from './ArtifactListItem.js'

const FILTER_OPTIONS: { value: ArtifactRenderType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'html', label: 'HTML' },
  { value: 'code', label: 'Code' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'svg', label: 'SVG' },
  { value: 'mermaid', label: 'Diagram' },
]

export function ArtifactListView() {
  const artifacts = useStore((s) => s.artifacts)
  const activeArtifactId = useStore((s) => s.activeArtifactId)
  const searchQuery = useStore((s) => s.artifactSearchQuery)
  const filterType = useStore((s) => s.artifactFilterType)
  const setSearchQuery = useStore((s) => s.setArtifactSearchQuery)
  const setFilterType = useStore((s) => s.setArtifactFilterType)
  const setActiveArtifact = useStore((s) => s.setActiveArtifact)
  const setViewMode = useStore((s) => s.setArtifactViewMode)

  const filtered = useMemo(() => {
    let result = artifacts
    if (filterType !== 'all') {
      result = result.filter((a) => a.renderType === filterType)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.filename || '').toLowerCase().includes(q),
      )
    }
    // Most recent first
    return [...result].reverse()
  }, [artifacts, filterType, searchQuery])

  const handleSelect = (id: string) => {
    setActiveArtifact(id)
    setViewMode('detail')
  }

  return (
    <div className="artifact-list">
      {/* Search */}
      <div className="artifact-list__search-wrapper">
        <Search size={14} strokeWidth={1.5} className="artifact-list__search-icon" />
        <input
          type="text"
          className="artifact-list__search"
          placeholder="Search artifacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="artifact-list__filters">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`artifact-list__filter ${filterType === opt.value ? 'artifact-list__filter--active' : ''}`}
            onClick={() => setFilterType(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="artifact-list__items">
        {filtered.length === 0 ? (
          <div className="artifact-list__no-results">
            {searchQuery || filterType !== 'all'
              ? 'No matching artifacts'
              : 'No artifacts yet'}
          </div>
        ) : (
          filtered.map((artifact) => (
            <ArtifactListItem
              key={artifact.id}
              artifact={artifact}
              isActive={artifact.id === activeArtifactId}
              onClick={() => handleSelect(artifact.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
