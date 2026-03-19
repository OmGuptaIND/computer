import React, { useState } from "react";
import { connection, type ConnectionConfig } from "../lib/connection.js";
import { loadMachines, saveMachines, type SavedMachine, useConnectionStatus } from "../lib/store.js";

export function Connect({ onConnected }: { onConnected: () => void }) {
  const status = useConnectionStatus();
  const [machines] = useState(loadMachines);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("9876");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [useTLS, setUseTLS] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = (config: ConnectionConfig, machineName?: string) => {
    setError("");

    const unsub = connection.onStatusChange((s, detail) => {
      if (s === "connected") {
        // Save machine for next time
        if (machineName || name) {
          const existing = loadMachines();
          const id = `${config.host}:${config.port}`;
          const updated = existing.filter((m) => m.id !== id);
          updated.push({
            id,
            name: machineName || name || config.host,
            host: config.host,
            port: config.port,
            token: config.token,
            useTLS: config.useTLS,
          });
          saveMachines(updated);
        }
        unsub();
        onConnected();
      } else if (s === "error") {
        setError(detail || "Connection failed");
        unsub();
      }
    });

    connection.connect(config);
  };

  const connectFromForm = () => {
    if (!host || !token) return;
    handleConnect({
      host,
      port: parseInt(port) || 9876,
      token,
      useTLS,
    });
  };

  const connectSaved = (machine: SavedMachine) => {
    handleConnect(
      { host: machine.host, port: machine.port, token: machine.token, useTLS: machine.useTLS },
      machine.name
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>&#9632;</span>
          <h1 style={styles.title}>anton.computer</h1>
        </div>
        <p style={styles.subtitle}>Connect to your cloud computer</p>

        {/* Saved machines */}
        {machines.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Your Machines</h3>
            {machines.map((m) => (
              <button
                key={m.id}
                style={styles.machineButton}
                onClick={() => connectSaved(m)}
                disabled={status === "connecting" || status === "authenticating"}
              >
                <span style={styles.machineName}>{m.name}</span>
                <span style={styles.machineHost}>{m.host}:{m.port}</span>
              </button>
            ))}
          </div>
        )}

        {/* New connection */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            {machines.length > 0 ? "Add New Machine" : "Connect"}
          </h3>

          <div style={styles.field}>
            <label style={styles.label}>Name (optional)</label>
            <input
              style={styles.input}
              placeholder="My VPS"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.field, flex: 2 }}>
              <label style={styles.label}>Host</label>
              <input
                style={styles.input}
                placeholder="192.168.1.100 or my-vps.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div style={{ ...styles.field, flex: 0, minWidth: 80 }}>
              <label style={styles.label}>Port</label>
              <input
                style={styles.input}
                placeholder="9876"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Token</label>
            <input
              style={styles.input}
              type="password"
              placeholder="ak_7f3a2b..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connectFromForm()}
            />
          </div>

          <div style={styles.checkRow}>
            <input
              type="checkbox"
              id="tls"
              checked={useTLS}
              onChange={(e) => setUseTLS(e.target.checked)}
            />
            <label htmlFor="tls" style={styles.checkLabel}>
              Use TLS (wss://)
            </label>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            style={styles.connectButton}
            onClick={connectFromForm}
            disabled={!host || !token || status === "connecting" || status === "authenticating"}
          >
            {status === "connecting"
              ? "Connecting..."
              : status === "authenticating"
                ? "Authenticating..."
                : "Connect"}
          </button>
        </div>

        <p style={styles.hint}>
          Don't have an agent running?{" "}
          <code style={styles.code}>curl -fsSL https://get.anton.computer | bash</code>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    background: "#0a0a0a",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#18181b",
    borderRadius: 12,
    padding: 32,
    border: "1px solid #27272a",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  logoIcon: {
    fontSize: 24,
    color: "#22c55e",
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "#fafafa",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 14,
    color: "#71717a",
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#a1a1aa",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 10,
  },
  machineButton: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "10px 14px",
    background: "#09090b",
    border: "1px solid #27272a",
    borderRadius: 8,
    color: "#fafafa",
    cursor: "pointer",
    marginBottom: 6,
    fontSize: 14,
  },
  machineName: {
    fontWeight: 500,
  },
  machineHost: {
    fontSize: 12,
    color: "#71717a",
    fontFamily: "monospace",
  },
  field: {
    marginBottom: 12,
    flex: 1,
  },
  label: {
    display: "block",
    fontSize: 12,
    color: "#a1a1aa",
    marginBottom: 4,
    fontWeight: 500,
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    background: "#09090b",
    border: "1px solid #27272a",
    borderRadius: 6,
    color: "#fafafa",
    fontSize: 14,
    fontFamily: "monospace",
    outline: "none",
  },
  row: {
    display: "flex",
    gap: 10,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  checkLabel: {
    fontSize: 13,
    color: "#a1a1aa",
  },
  error: {
    padding: "8px 12px",
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    borderRadius: 6,
    color: "#fca5a5",
    fontSize: 13,
    marginBottom: 12,
  },
  connectButton: {
    width: "100%",
    padding: "10px 16px",
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  hint: {
    fontSize: 12,
    color: "#52525b",
    textAlign: "center" as const,
    marginTop: 16,
    lineHeight: 1.5,
  },
  code: {
    background: "#27272a",
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "monospace",
    color: "#a1a1aa",
  },
};
