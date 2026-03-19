import React, { useState } from "react";
import { motion } from "framer-motion";
import { Server, Wifi, ArrowRight } from "lucide-react";
import { connection, type ConnectionConfig } from "../lib/connection.js";
import {
  loadMachines,
  saveMachines,
  type SavedMachine,
  useConnectionStatus,
} from "../lib/store.js";

export function Connect({ onConnected }: { onConnected: () => void }) {
  const status = useConnectionStatus();
  const [machines] = useState(loadMachines);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("9876");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [useTLS, setUseTLS] = useState(false);
  const [error, setError] = useState("");

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
    handleConnect({ host, port: parseInt(port) || 9876, token, useTLS });
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

  const isConnecting =
    status === "connecting" || status === "authenticating";

  return (
    <div className="flex items-center justify-center h-full bg-zinc-950 p-5">
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-zinc-900 rounded-2xl p-8 border border-zinc-800"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-green-600/15 flex items-center justify-center">
            <Server className="w-5 h-5 text-green-500" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            anton.computer
          </h1>
        </div>
        <p className="text-sm text-zinc-500 mb-6">
          Connect to your cloud computer
        </p>

        {/* Saved machines */}
        {machines.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
              Your Machines
            </h3>
            <div className="space-y-1.5">
              {machines.map((m) => (
                <button
                  key={m.id}
                  onClick={() => connectSaved(m)}
                  disabled={isConnecting}
                  className="group flex items-center justify-between w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl hover:bg-zinc-800/60 hover:border-zinc-700 transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <Wifi className="w-3.5 h-3.5 text-zinc-500 group-hover:text-green-500 transition-colors" />
                    <span className="text-sm font-medium text-zinc-200">
                      {m.name}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-600 font-mono">
                    {m.host}:{m.port}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New connection form */}
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            {machines.length > 0 ? "Add New Machine" : "Connect"}
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">
                Name (optional)
              </label>
              <input
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                placeholder="My VPS"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex gap-2.5">
              <div className="flex-[2]">
                <label className="block text-xs text-zinc-400 mb-1 font-medium">
                  Host
                </label>
                <input
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 font-mono placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                  placeholder="192.168.1.100"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div className="w-20">
                <label className="block text-xs text-zinc-400 mb-1 font-medium">
                  Port
                </label>
                <input
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 font-mono placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                  placeholder="9876"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">
                Token
              </label>
              <input
                type="password"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 font-mono placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                placeholder="ak_7f3a2b..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connectFromForm()}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTLS}
                onChange={(e) => setUseTLS(e.target.checked)}
                className="accent-green-500"
              />
              <span className="text-xs text-zinc-400">Use TLS (wss://)</span>
            </label>
          </div>

          {error && (
            <div className="mt-3 px-3 py-2 bg-red-950/40 border border-red-900/40 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={connectFromForm}
            disabled={!host || !token || isConnecting}
            className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 rounded-xl text-sm font-semibold text-white hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
          >
            {isConnecting ? (
              status === "connecting" ? "Connecting..." : "Authenticating..."
            ) : (
              <>
                Connect
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-zinc-600 text-center leading-relaxed">
          Don't have an agent running?{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400">
            curl -fsSL https://get.anton.computer | bash
          </code>
        </p>
      </motion.div>
    </div>
  );
}
