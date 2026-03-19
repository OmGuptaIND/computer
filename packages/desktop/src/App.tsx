import React, { useState } from "react";
import { Connect } from "./components/Connect.js";
import { Sidebar } from "./components/Sidebar.js";
import { AgentChat } from "./components/AgentChat.js";
import { Terminal } from "./components/Terminal.js";
import { useConnectionStatus, useStore } from "./lib/store.js";
import { connection } from "./lib/connection.js";
import { Bot, TerminalSquare } from "lucide-react";

type View = "agent" | "terminal";

export function App() {
  const [connected, setConnected] = useState(false);
  const [activeView, setActiveView] = useState<View>("agent");
  const status = useConnectionStatus();

  const handleDisconnect = () => {
    connection.disconnect();
    setConnected(false);
  };

  // Show connect screen if not connected
  if (!connected) {
    return <Connect onConnected={() => setConnected(true)} />;
  }

  // Disconnected after being connected — show reconnect
  if (status === "disconnected" || status === "error") {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center p-8">
          <p className="text-lg font-semibold text-zinc-100 mb-2">
            Connection lost
          </p>
          <p className="text-sm text-zinc-500 mb-5">Reconnecting...</p>
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Connect to a different machine
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-zinc-950">
      <Sidebar onDisconnect={handleDisconnect} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* View toggle */}
        <div
          className="flex items-center gap-1 px-4 pt-2 pb-1"
          data-tauri-drag-region
        >
          <div className="flex bg-zinc-900 rounded-lg p-0.5">
            <ViewTab
              active={activeView === "agent"}
              onClick={() => setActiveView("agent")}
              icon={<Bot className="w-3.5 h-3.5" />}
              label="Agent"
            />
            <ViewTab
              active={activeView === "terminal"}
              onClick={() => setActiveView("terminal")}
              icon={<TerminalSquare className="w-3.5 h-3.5" />}
              label="Terminal"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
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
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-800 text-zinc-200"
          : "text-zinc-500 hover:text-zinc-400"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
