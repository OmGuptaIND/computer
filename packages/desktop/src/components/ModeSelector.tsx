import { connection } from '../lib/connection.js'
import { useStore } from '../lib/store.js'

const MODES = [
  { key: 'chat' as const, label: 'Chat' },
  { key: 'projects' as const, label: 'Projects' },
]

export function ModeSelector() {
  const activeView = useStore((s) => s.activeView)
  const setActiveView = useStore((s) => s.setActiveView)

  const handleViewChange = (key: (typeof MODES)[number]['key']) => {
    setActiveView(key)
    if (key === 'projects') {
      connection.sendProjectsList()
    }
  }

  return (
    <div className="mode-selector">
      {MODES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          className={`mode-selector__tab${activeView === mode.key ? ' mode-selector__tab--active' : ''}`}
          onClick={() => handleViewChange(mode.key)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}
