import { Plus, Settings2, Unplug, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { connection } from '../../lib/connection.js'
import { type ConnectorStatusInfo, useStore } from '../../lib/store.js'
import { ConnectorIcon } from '../connectors/ConnectorIcons.js'

/**
 * ConnectorPill — sits in the composer toolbar row, inline with + and plan buttons.
 * Shows connected tool icons as a pill group. Clicking opens the dropdown.
 *
 * Layout (Manus-style): [+] [⊙ N] [🖥]  ...  [model] [send]
 */
export function ConnectorPill() {
  const connectors = useStore((s) => s.connectors)
  const registry = useStore((s) => s.connectorRegistry)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    connection.sendConnectorsList()
    connection.sendConnectorRegistryList()
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const connectedOnes = connectors.filter((c) => c.connected)
  const enabledOnes = connectors.filter((c) => c.connected && c.enabled)
  const connectedIds = new Set(connectors.map((c) => c.id))
  const unconnectedRegistry = registry.filter((r) => !connectedIds.has(r.id)).slice(0, 8)
  const totalAvailable = registry.filter((r) => !connectedIds.has(r.id)).length

  const handleToggle = (connector: ConnectorStatusInfo) => {
    connection.sendConnectorToggle(connector.id, !connector.enabled)
  }

  const openSettings = () => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'connectors' } }))
  }

  return (
    <div className="connector-pill-wrap" ref={wrapRef}>
      {/* Connected icons pill — only show when there are connected tools */}
      {enabledOnes.length > 0 && (
        <button
          type="button"
          className="connector-pill"
          onClick={() => setOpen(!open)}
          aria-label="Connected tools"
        >
          {enabledOnes.slice(0, 4).map((c) => (
            <span key={c.id} className="connector-pill__icon">
              <ConnectorIcon id={c.id} size={16} />
            </span>
          ))}
          {enabledOnes.length > 4 && (
            <span className="connector-pill__more">+{enabledOnes.length - 4}</span>
          )}
        </button>
      )}

      {/* Connect apps icon */}
      <button
        type="button"
        className="composer__btn"
        aria-label="Connect apps"
        title="Connect apps"
        onClick={() => setOpen(!open)}
      >
        <Unplug size={18} strokeWidth={1.5} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="connector-dropdown">
          {/* Connected connectors with toggles */}
          {connectors.filter((c) => c.connected).map((c) => (
            <div key={c.id} className="connector-dropdown__item">
              <div className="connector-dropdown__item-left">
                <ConnectorIcon id={c.id} size={20} />
                <span className="connector-dropdown__item-name">{c.name}</span>
              </div>
              <label className="connector-dropdown__toggle">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={() => handleToggle(c)}
                />
                <span className="connector-dropdown__toggle-track" />
              </label>
            </div>
          ))}

          {/* Unconnected from registry */}
          {unconnectedRegistry.map((r) => (
            <div key={r.id} className="connector-dropdown__item connector-dropdown__item--unconnected">
              <div className="connector-dropdown__item-left">
                <ConnectorIcon id={r.id} size={20} />
                <span className="connector-dropdown__item-name">{r.name}</span>
              </div>
              <span className="connector-dropdown__item-connect">Connect</span>
            </div>
          ))}

          {/* Footer */}
          <div className="connector-dropdown__footer">
            <button type="button" className="connector-dropdown__footer-btn" onClick={openSettings}>
              <Plus size={16} strokeWidth={1.5} />
              <span>Add connectors</span>
              {totalAvailable > 0 && (
                <span className="connector-dropdown__footer-count">+{totalAvailable}</span>
              )}
            </button>
            <button type="button" className="connector-dropdown__footer-btn" onClick={openSettings}>
              <Settings2 size={16} strokeWidth={1.5} />
              <span>Manage connectors</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ConnectorBanner — sits BELOW the composer box.
 * Shows "Connect your tools" with registry icons when no connectors are connected.
 */
export function ConnectorBanner() {
  const connectors = useStore((s) => s.connectors)
  const registry = useStore((s) => s.connectorRegistry)
  const [dismissed, setDismissed] = useState(false)

  const connectedOnes = connectors.filter((c) => c.connected)
  const showBanner = connectedOnes.length === 0 && !dismissed && registry.length > 0

  if (!showBanner) return null

  const openConnectors = () => {
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'connectors' } }))
  }

  return (
    <div
      className="connector-banner"
      onClick={openConnectors}
      onKeyDown={(e) => { if (e.key === 'Enter') openConnectors() }}
      role="button"
      tabIndex={0}
    >
      <div className="connector-banner__left">
        <Unplug size={16} strokeWidth={1.5} />
        <span>Connect your tools</span>
      </div>
      <div className="connector-banner__right">
        {registry.slice(0, 6).map((r) => (
          <span key={r.id} className="connector-banner__icon">
            <ConnectorIcon id={r.id} size={20} />
          </span>
        ))}
        <button
          type="button"
          className="connector-banner__dismiss"
          onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
          aria-label="Dismiss"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
