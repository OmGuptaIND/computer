import React, { useState } from "react";
import { Connect } from "./components/Connect.js";
import { AgentChat } from "./components/AgentChat.js";
import { Terminal } from "./components/Terminal.js";
import { useConnectionStatus } from "./lib/store.js";
import { connection } from "./lib/connection.js";

type Tab = "agent" | "terminal";

export function App() {
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("agent");
  const status = useConnectionStatus();

  // Show connect screen if not connected
  if (!connected) {
    return <Connect onConnected={() => setConnected(true)} />;
  }

  // If disconnected after being connected, show reconnect banner
  if (status === "disconnected" || status === "error") {
    return (
      <div style={styles.disconnected}>
        <div style={styles.disconnectedCard}>
          <p style={styles.disconnectedTitle}>Connection lost</p>
          <p style={styles.disconnectedText}>Reconnecting...</p>
          <button
            style={styles.disconnectedButton}
            onClick={() => { connection.disconnect(); setConnected(false); }}
          >
            Connect to a different machine
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.logoIcon}>&#9632;</span>
          <span style={styles.logoText}>anton</span>
        </div>

        <nav style={styles.nav}>
          <button
            style={activeTab === "agent" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveTab("agent")}
          >
            <span style={styles.navIcon}>&#9881;</span>
            Agent
          </button>
          <button
            style={activeTab === "terminal" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveTab("terminal")}
          >
            <span style={styles.navIcon}>&#9002;</span>
            Terminal
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.connectionInfo}>
            <span style={{ ...styles.dot, background: status === "connected" ? "#22c55e" : "#ef4444" }} />
            <span style={styles.connectionText}>
              {status === "connected" ? "Connected" : status}
            </span>
          </div>
          <button
            style={styles.disconnectButton}
            onClick={() => { connection.disconnect(); setConnected(false); }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>
        {activeTab === "agent" && <AgentChat />}
        {activeTab === "terminal" && <Terminal />}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "flex",
    height: "100%",
    background: "#0a0a0a",
  },
  sidebar: {
    width: 200,
    background: "#09090b",
    borderRight: "1px solid #1c1c1e",
    display: "flex",
    flexDirection: "column",
    // Tauri: make title bar draggable
    WebkitUserSelect: "none",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "20px 16px 16px",
    // Leave space for traffic lights on macOS
    paddingTop: 40,
  },
  logoIcon: {
    fontSize: 18,
    color: "#22c55e",
  },
  logoText: {
    fontSize: 15,
    fontWeight: 600,
    color: "#fafafa",
    letterSpacing: "-0.02em",
  },
  nav: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "0 8px",
  },
  navButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    borderRadius: 6,
    color: "#71717a",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    textAlign: "left" as const,
  },
  navButtonActive: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    background: "#18181b",
    border: "none",
    borderRadius: 6,
    color: "#fafafa",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    textAlign: "left" as const,
  },
  navIcon: {
    fontSize: 14,
    width: 18,
    textAlign: "center" as const,
  },
  sidebarFooter: {
    padding: "12px 12px 16px",
    borderTop: "1px solid #1c1c1e",
  },
  connectionInfo: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
  },
  connectionText: {
    fontSize: 11,
    color: "#71717a",
  },
  disconnectButton: {
    width: "100%",
    padding: "6px 10px",
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 6,
    color: "#a1a1aa",
    cursor: "pointer",
    fontSize: 12,
  },
  main: {
    flex: 1,
    overflow: "hidden",
  },
  disconnected: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    background: "#0a0a0a",
  },
  disconnectedCard: {
    textAlign: "center" as const,
    padding: 32,
  },
  disconnectedTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#fafafa",
    marginBottom: 8,
  },
  disconnectedText: {
    fontSize: 14,
    color: "#71717a",
    marginBottom: 20,
  },
  disconnectedButton: {
    padding: "8px 16px",
    background: "#27272a",
    border: "1px solid #3f3f46",
    borderRadius: 8,
    color: "#e4e4e7",
    cursor: "pointer",
    fontSize: 13,
  },
};
