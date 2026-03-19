import { Bot, Sparkles, TerminalSquare } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { AgentChat } from './components/AgentChat.js'
import { Connect } from './components/Connect.js'
import { Sidebar } from './components/Sidebar.js'
import { Terminal } from './components/Terminal.js'
import { connection } from './lib/connection.js'
import { useConnectionStatus, useStore } from './lib/store.js'

type View = 'agent' | 'terminal'

export function App() {
  const [connected, setConnected] = useState(false)
  const [activeView, setActiveView] = useState<View>('agent')
  const status = useConnectionStatus()

  // Fetch sessions and providers when connection is established
  useEffect(() => {
    if (status === 'connected') {
      connection.sendProvidersList()
      connection.sendSessionsList()
    }
  }, [status])

  // Auto-resume the most recent server session when sessions list arrives
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      // When sessions list changes from empty to populated
      if (state.sessions.length > 0 && prev.sessions.length === 0) {
        const latest = state.sessions[0] // sorted by lastActiveAt desc
        // Resume the latest session and link to a conversation
        const existing = state.findConversationBySession(latest.id)
        if (existing) {
          useStore.getState().switchConversation(existing.id)
        } else {
          useStore.getState().newConversation(latest.title, latest.id)
        }
        connection.sendSessionResume(latest.id)
        // Fetch history to populate messages
        connection.sendSessionHistory(latest.id)
      }
    })
    return unsub
  }, [])

  const handleDisconnect = () => {
    connection.disconnect()
    setConnected(false)
  }

  if (!connected) {
    return <Connect onConnected={() => setConnected(true)} />
  }

  if (status === 'disconnected' || status === 'error') {
    return (
      <div className="connection-screen">
        <div className="connection-card">
          <p className="connection-card__title">Connection paused</p>
          <p className="connection-card__copy">
            We lost contact with your machine. You can reconnect in one click.
          </p>
          <button type="button" onClick={handleDisconnect} className="button button--primary">
            Connect to a machine
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar onDisconnect={handleDisconnect} />

      <div className="workspace-shell">
        <header className="workspace-header" data-tauri-drag-region>
          <div className="workspace-header__copy">
            <p className="workspace-header__eyebrow">Workspace</p>
            <p className="workspace-header__title">Personal Cloud Computer</p>
            <p className="workspace-header__subtitle">
              {activeView === 'agent'
                ? 'Describe what you need in plain language.'
                : 'Run and monitor commands in real time.'}
            </p>
          </div>

          <div className="workspace-header__actions">
            {activeView === 'agent' && (
              <div className="workspace-badge">
                <Sparkles className="workspace-badge__icon" />
                <span>Guided mode</span>
              </div>
            )}
            <div className="workspace-tabs">
              <ViewTab
                active={activeView === 'agent'}
                onClick={() => setActiveView('agent')}
                icon={<Bot className="workspace-tab__icon" />}
                label="Assistant"
              />
              <ViewTab
                active={activeView === 'terminal'}
                onClick={() => setActiveView('terminal')}
                icon={<TerminalSquare className="workspace-tab__icon" />}
                label="Terminal"
              />
            </div>
          </div>
        </header>

        <div className="workspace-body">
          {activeView === 'agent' && <AgentChat />}
          {activeView === 'terminal' && <Terminal />}
        </div>
      </div>
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
