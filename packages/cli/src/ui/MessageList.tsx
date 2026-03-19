import React from "react";
import { Box, Text } from "ink";
import { theme, ICONS } from "../lib/theme.js";

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "tool_call" | "tool_result" | "confirm" | "error" | "thinking";
  content: string;
  toolName?: string;
  toolId?: string;
  isError?: boolean;
  timestamp: number;
}

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </Box>
  );
}

function MessageItem({ message }: { message: ChatMessage }) {
  switch (message.role) {
    case "user":
      return (
        <Box marginTop={1} marginBottom={0}>
          <Text>
            <Text color="cyan" bold>{ICONS.prompt} </Text>
            <Text>{message.content}</Text>
          </Text>
        </Box>
      );

    case "agent":
      return (
        <Box marginY={0} flexDirection="column">
          <Text color="#FF6B35" bold>{ICONS.arrow} anton</Text>
          <Box paddingLeft={2}>
            <Text wrap="wrap">{message.content}</Text>
          </Box>
        </Box>
      );

    case "thinking":
      return (
        <Box marginY={0}>
          <Text dimColor>
            {ICONS.thinking} <Text italic>{message.content}</Text>
          </Text>
        </Box>
      );

    case "tool_call":
      return (
        <Box marginY={0}>
          <Text>
            <Text color="yellow">{ICONS.tool} {message.toolName}</Text>
            <Text dimColor> {truncate(message.content, 80)}</Text>
          </Text>
        </Box>
      );

    case "tool_result":
      return (
        <Box marginY={0}>
          <Text>
            {message.isError ? (
              <Text color="red">{ICONS.toolError} </Text>
            ) : (
              <Text color="green">{ICONS.toolDone} </Text>
            )}
            <Text dimColor>{truncate(message.content, 120)}</Text>
          </Text>
        </Box>
      );

    case "confirm":
      return (
        <Box marginY={0}>
          <Text>
            <Text color="yellow">{ICONS.confirm} Confirm: </Text>
            <Text bold>{message.content}</Text>
          </Text>
        </Box>
      );

    case "error":
      return (
        <Box marginY={0}>
          <Text color="red">Error: {message.content}</Text>
        </Box>
      );

    default:
      return <Text>{message.content}</Text>;
  }
}

function truncate(str: string, max: number): string {
  const oneLine = str.replace(/\n/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + "…";
}
