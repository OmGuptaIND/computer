import React from "react";
import { Box, Text } from "ink";
import { ICONS } from "../lib/theme.js";
import type { ConnectionStatus } from "../lib/connection.js";

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  agentStatus: "idle" | "working" | "error";
  machineName?: string;
  agentId?: string;
}

export function StatusBar({ connectionStatus, agentStatus, machineName, agentId }: StatusBarProps) {
  const connIcon =
    connectionStatus === "connected" ? ICONS.connected :
    connectionStatus === "connecting" || connectionStatus === "authenticating" ? ICONS.connecting :
    ICONS.disconnected;

  const agentStatusText =
    agentStatus === "working" ? "working..." :
    agentStatus === "error" ? "error" :
    "idle";

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text>
        {connIcon}{" "}
        <Text dimColor>{machineName ?? "not connected"}</Text>
        {agentId && <Text dimColor> ({agentId})</Text>}
      </Text>
      <Text dimColor>
        {agentStatus === "working" ? (
          <Text color="yellow">● {agentStatusText}</Text>
        ) : (
          agentStatusText
        )}
      </Text>
    </Box>
  );
}
