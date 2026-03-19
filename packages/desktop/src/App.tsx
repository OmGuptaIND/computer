import React, { useState } from "react";
import { Bot, Sparkles, TerminalSquare } from "lucide-react";
import { Connect } from "./components/Connect.js";
import { Sidebar } from "./components/Sidebar.js";
import { AgentChat } from "./components/AgentChat.js";
import { Terminal } from "./components/Terminal.js";
import { useConnectionStatus } from "./lib/store.js";
import { connection } from "./lib/connection.js";

type View = "agent" | "terminal";

export function App() {
  const [connected, setConnected] = useState(false);
  const [activeView, setActiveView] = useState<View>("agent");
  const status = useConnectionStatus();

  const handleDisconnect = () => {
    connection.disconnect();
    setConnected(false);
  };

  if (!connected) {
    return <Connect onConnected={() => setConnected(true)} />;
  }

  if (status === "disconnected" || status === "error") {
    return (
      <div className="connection-screen">
        <div className="connection-card">
          <p className="connection-card__title">Connection paused</p>
          <p className="connection-card__copy">
            We lost contact with your machine. You can reconnect in one click.
          </p>
          <button
            onClick={handleDisconnect}
            className="button button--primary"
          >
            Connect to a machine
          </button>
        </div>
      </div>
    );
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
              {activeView === "agent"
                ? "Describe what you need in plain language."
                : "Run and monitor commands in real time."}
            </p>
          </div>

          <div className="workspace-header__actions">
            {activeView === "agent" && (
              <div className="workspace-badge">
                <Sparkles className="workspace-badge__icon" />
                <span>Guided mode</span>
              </div>
            )}
            <div className="workspace-tabs">
              <ViewTab
                active={activeView === "agent"}
                onClick={() => setActiveView("agent")}
                icon={<Bot className="workspace-tab__icon" />}
                label="Assistant"
              />
              <ViewTab
                active={activeView === "terminal"}
                onClick={() => setActiveView("terminal")}
                icon={<TerminalSquare className="workspace-tab__icon" />}
                label="Terminal"
              />
            </div>
          </div>
        </header>

        <div className="workspace-body">
          {activeView === "agent" && <AgentChat />}
          {activeView === "terminal" && <Terminal />}
        </div>
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={active ? "workspace-tab workspace-tab--active" : "workspace-tab"}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
