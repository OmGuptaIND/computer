import { Globe, MousePointer, Navigation, PenLine, ScrollText } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useStore } from '../../lib/store.js'

function formatAction(action: { action: string; target?: string; value?: string }): string {
  switch (action.action) {
    case 'open':
      return `Navigated to ${action.target || 'page'}`
    case 'click':
      return `Clicked ${action.target || 'element'}`
    case 'fill':
      return `Typed "${action.value || ''}" into ${action.target || 'input'}`
    case 'scroll':
      return `Scrolled ${action.target || 'down'} ${action.value || ''}px`
    case 'snapshot':
      return 'Read page elements'
    case 'screenshot':
      return 'Captured screenshot'
    case 'wait':
      return `Waited for ${action.target || 'page load'}`
    case 'get':
      return `Read ${action.target || 'page info'}`
    default:
      return action.action
  }
}

function actionIcon(action: string) {
  switch (action) {
    case 'open':
      return <Navigation size={12} strokeWidth={1.5} />
    case 'click':
      return <MousePointer size={12} strokeWidth={1.5} />
    case 'fill':
      return <PenLine size={12} strokeWidth={1.5} />
    case 'snapshot':
      return <ScrollText size={12} strokeWidth={1.5} />
    default:
      return <Globe size={12} strokeWidth={1.5} />
  }
}

export function BrowserViewerContent() {
  const browserState = useStore((s) => s.browserState)
  const actionCount = browserState?.actions.length ?? 0
  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll action log when new actions arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: actionCount triggers scroll on new actions
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [actionCount])

  if (!browserState) {
    return (
      <div className="browser-viewer browser-viewer--empty">
        <Globe size={32} strokeWidth={1} style={{ opacity: 0.3 }} />
        <p style={{ opacity: 0.5, fontSize: '13px' }}>Browser not active</p>
      </div>
    )
  }

  return (
    <div className="browser-viewer">
      {/* URL Bar */}
      <div className="browser-viewer__url-bar">
        <Globe size={14} strokeWidth={1.5} style={{ opacity: 0.5, flexShrink: 0 }} />
        <span className="browser-viewer__url" title={browserState.url}>
          {browserState.url}
        </span>
      </div>

      {/* Screenshot */}
      <div className="browser-viewer__screenshot">
        {browserState.screenshot ? (
          <img
            src={`data:image/png;base64,${browserState.screenshot}`}
            alt={browserState.title || 'Browser screenshot'}
          />
        ) : (
          <div className="browser-viewer__screenshot-placeholder">
            <Globe size={24} strokeWidth={1} style={{ opacity: 0.2 }} />
            <span style={{ opacity: 0.4, fontSize: '12px' }}>Waiting for screenshot...</span>
          </div>
        )}
      </div>

      {/* Action Log */}
      <div className="browser-viewer__actions">
        <div className="browser-viewer__actions-header">Activity</div>
        <div className="browser-viewer__actions-list">
          {browserState.actions.map((action, i) => (
            <div key={`${action.timestamp}-${i}`} className="browser-viewer__action-item">
              {actionIcon(action.action)}
              <span>{formatAction(action)}</span>
              <span className="browser-viewer__action-time">
                {new Date(action.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
