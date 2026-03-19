import React from "react";
import type { ConnectionStatus } from "../../lib/connection.js";
import type { AgentStatus } from "../../lib/store.js";

interface Props {
  type: "connection" | "agent";
  status: ConnectionStatus | AgentStatus;
  label?: boolean;
}

export function StatusIndicator({ type, status, label = true }: Props) {
  const config = type === "connection"
    ? connectionConfig[status as ConnectionStatus] || connectionConfig.disconnected
    : agentConfig[status as AgentStatus] || agentConfig.unknown;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.color} ${config.animate ? "animate-pulse" : ""}`}
      />
      {label && (
        <span className="text-[11px] text-zinc-500">{config.label}</span>
      )}
    </div>
  );
}

const connectionConfig: Record<ConnectionStatus, { color: string; label: string; animate: boolean }> = {
  connected: { color: "bg-green-500", label: "Connected", animate: false },
  connecting: { color: "bg-yellow-500", label: "Connecting...", animate: true },
  authenticating: { color: "bg-yellow-500", label: "Authenticating...", animate: true },
  disconnected: { color: "bg-zinc-600", label: "Disconnected", animate: false },
  error: { color: "bg-red-500", label: "Error", animate: false },
};

const agentConfig: Record<AgentStatus, { color: string; label: string; animate: boolean }> = {
  idle: { color: "bg-green-500", label: "Ready", animate: false },
  working: { color: "bg-yellow-500", label: "Working...", animate: true },
  error: { color: "bg-red-500", label: "Error", animate: false },
  unknown: { color: "bg-zinc-600", label: "Unknown", animate: false },
};
