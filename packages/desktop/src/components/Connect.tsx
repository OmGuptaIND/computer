import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, Lock, Server, ShieldCheck, Unlock, Wifi,
} from "lucide-react";
import { connection, type ConnectionConfig } from "../lib/connection.js";
import {
  loadMachines,
  saveMachines,
  type SavedMachine,
  useConnectionStatus,
} from "../lib/store.js";

const PORT_PLAIN = 9876;
const PORT_TLS = 9877;

export function Connect({ onConnected }: { onConnected: () => void }) {
  const status = useConnectionStatus();
  const [machines] = useState(loadMachines);
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [useTLS, setUseTLS] = useState(false);
  const [error, setError] = useState("");

  const port = useTLS ? PORT_TLS : PORT_PLAIN;
  const isConnecting = status === "connecting" || status === "authenticating";

  const handleConnect = (
    config: ConnectionConfig,
    machineName?: string
  ) => {
    setError("");

    const unsub = connection.onStatusChange((s, detail) => {
      if (s === "connected") {
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
    handleConnect({ host, port, token, useTLS });
  };

  const connectSaved = (machine: SavedMachine) => {
    handleConnect(
      {
        host: machine.host,
        port: machine.port,
        token: machine.token,
        useTLS: machine.useTLS,
      },
      machine.name
    );
  };

  return (
    <div className="connect-screen">
      <header className="connect-screen__header">
        <div className="connect-screen__eyebrow">Personal Cloud Computer</div>
        <div className="connect-screen__brand">
          <span className="connect-screen__brandDot" />
          <span className="connect-screen__brandText">anton</span>
        </div>
      </header>

      <div className="connect-screen__body">
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.24 }}
          className="connect-panel"
        >
          <section className="connect-panel__intro">
            <div className="connect-panel__introBadge">
              <Server className="connect-panel__introBadgeIcon" />
            </div>

            <div className="connect-panel__introCopy">
              <p className="connect-panel__kicker">anton.computer</p>
              <h1 className="connect-panel__title">Connect your machine once.</h1>
              <p className="connect-panel__subtitle">
                Then run real tasks in plain language from a calmer workspace.
              </p>
            </div>

            <div className="connect-panel__bullets">
              <div className="connect-bullet">
                <ShieldCheck className="connect-bullet__icon" />
                <div>
                  <p className="connect-bullet__title">Secure by default</p>
                  <p className="connect-bullet__copy">Use standard or TLS mode depending on how your machine is exposed.</p>
                </div>
              </div>
              <div className="connect-bullet">
                <Wifi className="connect-bullet__icon" />
                <div>
                  <p className="connect-bullet__title">Reconnect instantly</p>
                  <p className="connect-bullet__copy">Saved machines stay available here for one-click access.</p>
                </div>
              </div>
            </div>

            <div className="connect-panel__install">
              <span className="connect-panel__installLabel">First time setting up a machine?</span>
              <code className="connect-panel__installCode">curl -fsSL https://get.anton.computer | bash</code>
            </div>
          </section>

          <section className="connect-formCard">
            {machines.length > 0 && (
              <div className="connect-formCard__saved">
                <div className="connect-formCard__sectionHeader">
                  <p className="connect-formCard__sectionTitle">Recent machines</p>
                </div>
                <div className="connect-savedList">
                  {machines.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => connectSaved(m)}
                      disabled={isConnecting}
                      className="connect-savedItem"
                    >
                      <div className="connect-savedItem__left">
                        <Wifi className="connect-savedItem__icon" />
                        <div className="connect-savedItem__copy">
                          <span className="connect-savedItem__name">{m.name}</span>
                          <span className="connect-savedItem__host">{m.host}</span>
                        </div>
                      </div>
                      {m.useTLS && <Lock className="connect-savedItem__lock" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="connect-form">
              <ConnectLabel>Host address</ConnectLabel>
              <input
                className="connect-input connect-input--mono"
                placeholder="148.113.4.94 or my-vps.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />

              <ConnectLabel>Token</ConnectLabel>
              <input
                type="password"
                className="connect-input connect-input--mono"
                placeholder="ak_7f3a2b..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connectFromForm()}
              />

              <ConnectLabel>
                Machine name <span className="connect-label__optional">(optional)</span>
              </ConnectLabel>
              <input
                className="connect-input"
                placeholder="Production server"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="connect-toggle">
                <input
                  type="checkbox"
                  checked={useTLS}
                  onChange={(e) => setUseTLS(e.target.checked)}
                  className="connect-toggle__checkbox"
                />
                <span className="connect-toggle__body">
                  {useTLS ? <Lock className="connect-toggle__icon" /> : <Unlock className="connect-toggle__icon" />}
                  <span className="connect-toggle__text">
                    {useTLS
                      ? `Secure connection (wss://, port ${PORT_TLS})`
                      : `Standard connection (ws://, port ${PORT_PLAIN})`}
                  </span>
                </span>
              </label>

              {error && <div className="connect-error">{error}</div>}

              <button
                onClick={connectFromForm}
                disabled={!host || !token || isConnecting}
                className="connect-submit"
              >
                <span className="connect-submit__label">
                  {isConnecting
                    ? status === "connecting"
                      ? "Connecting..."
                      : "Verifying..."
                    : "Connect to machine"}
                </span>
                <span className="connect-submit__iconWrap">
                  <ArrowRight className="connect-submit__icon" />
                </span>
              </button>
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}

function ConnectLabel({ children }: { children: React.ReactNode }) {
  return <label className="connect-label">{children}</label>;
}
