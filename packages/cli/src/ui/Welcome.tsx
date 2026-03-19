import React from "react";
import { Box, Text } from "ink";
import { theme, ICONS } from "../lib/theme.js";
import type { ConnectionStatus } from "../lib/connection.js";

interface WelcomeProps {
  version: string;
  machineName?: string;
  agentId?: string;
  status: ConnectionStatus;
}

export function Welcome({ version, machineName, agentId, status }: WelcomeProps) {
  const statusIcon =
    status === "connected" ? ICONS.connected :
    status === "connecting" || status === "authenticating" ? ICONS.connecting :
    ICONS.disconnected;

  const statusText =
    status === "connected" ? "Connected" :
    status === "connecting" ? "Connecting..." :
    status === "authenticating" ? "Authenticating..." :
    status === "error" ? "Error" :
    "Disconnected";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" marginBottom={1}>
        <Box flexDirection="column" borderStyle="round" borderColor="#FF6B35" paddingX={2} paddingY={1}>
          <Text bold color="#FF6B35">anton.computer</Text>
          <Text dimColor>CLI v{version}</Text>
        </Box>
        <Box flexDirection="column" marginLeft={2} paddingY={1}>
          <Text bold>Status</Text>
          <Text>{statusIcon} {statusText}</Text>
          {machineName && <Text dimColor>Machine: {machineName}</Text>}
          {agentId && <Text dimColor>Agent: {agentId}</Text>}
        </Box>
      </Box>
      <Text dimColor>Type a message to chat with your agent. Ctrl+C to exit.</Text>
    </Box>
  );
}
