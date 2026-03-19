import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Connection } from "../lib/connection.js";
import type { ConnectionStatus } from "../lib/connection.js";
import type { SavedMachine } from "../lib/machines.js";
import { Channel } from "@anton/protocol";
import type { AiMessage, EventMessage } from "@anton/protocol";
import { Welcome } from "./Welcome.js";
import { MessageList } from "./MessageList.js";
import type { ChatMessage } from "./MessageList.js";
import { ChatInput } from "./ChatInput.js";
import { ConfirmPrompt } from "./ConfirmPrompt.js";
import { StatusBar } from "./StatusBar.js";

interface AppProps {
  machine: SavedMachine;
}

export function App({ machine }: AppProps) {
  const { exit } = useApp();
  const [conn] = useState(() => new Connection());
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [agentStatus, setAgentStatus] = useState<"idle" | "working" | "error">("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<{ id: string; command: string; reason: string } | null>(null);
  const [agentId, setAgentId] = useState("");

  // Connect on mount
  useEffect(() => {
    conn.onStatusChange((status, detail) => {
      setConnStatus(status);
      if (status === "connected") {
        setAgentId(conn.agentId);
      }
    });

    conn.onMessage((channel, payload) => {
      if (channel === Channel.AI) {
        handleAiMessage(payload as AiMessage);
      } else if (channel === Channel.EVENTS) {
        handleEvent(payload as EventMessage);
      }
    });

    conn.connect({
      host: machine.host,
      port: machine.port,
      token: machine.token,
      useTLS: machine.useTLS,
    }).catch((err) => {
      addMessage({ role: "error", content: `Connection failed: ${err.message}` });
    });

    return () => conn.disconnect();
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() },
    ]);
  }, []);

  // Track the current streaming text buffer
  const appendAgentText = useCallback((content: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "agent") {
        // Append to existing agent message
        return [...prev.slice(0, -1), { ...last, content: last.content + content }];
      }
      // Start new agent message
      return [
        ...prev,
        { role: "agent", content, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() },
      ];
    });
  }, []);

  const handleAiMessage = useCallback((msg: AiMessage) => {
    switch (msg.type) {
      case "text":
        appendAgentText(msg.content);
        break;
      case "thinking":
        addMessage({ role: "thinking", content: msg.text });
        break;
      case "tool_call":
        addMessage({
          role: "tool_call",
          content: JSON.stringify(msg.input),
          toolName: msg.name,
          toolId: msg.id,
        });
        break;
      case "tool_result":
        addMessage({
          role: "tool_result",
          content: msg.output,
          toolId: msg.id,
          isError: msg.isError,
        });
        break;
      case "confirm":
        setPendingConfirm({ id: msg.id, command: msg.command, reason: msg.reason });
        break;
      case "error":
        addMessage({ role: "error", content: msg.message });
        break;
      case "done":
        // Agent finished — just let status update handle it
        break;
    }
  }, [addMessage, appendAgentText]);

  const handleEvent = useCallback((event: EventMessage) => {
    if (event.type === "agent_status") {
      setAgentStatus(event.status);
    }
  }, []);

  const handleSend = useCallback((content: string) => {
    if (content === "/quit" || content === "/exit") {
      conn.disconnect();
      exit();
      return;
    }

    addMessage({ role: "user", content });
    conn.sendAiMessage(content);
  }, [conn, addMessage, exit]);

  const handleConfirmResponse = useCallback((id: string, approved: boolean) => {
    conn.sendConfirmResponse(id, approved);
    setPendingConfirm(null);
    addMessage({
      role: approved ? "tool_result" : "error",
      content: approved ? "Approved" : "Denied",
      toolId: id,
    });
  }, [conn, addMessage]);

  // Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      conn.disconnect();
      exit();
    }
  });

  const isWorking = agentStatus === "working";

  return (
    <Box flexDirection="column" height="100%">
      <Welcome
        version="0.1.0"
        machineName={machine.name}
        agentId={agentId}
        status={connStatus}
      />

      <Box flexDirection="column" flexGrow={1} paddingX={0}>
        <MessageList messages={messages} />
      </Box>

      {pendingConfirm && (
        <ConfirmPrompt
          id={pendingConfirm.id}
          command={pendingConfirm.command}
          reason={pendingConfirm.reason}
          onRespond={handleConfirmResponse}
        />
      )}

      <Box borderStyle="single" borderColor="gray" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <ChatInput onSubmit={handleSend} disabled={isWorking || !!pendingConfirm} />
      </Box>

      <StatusBar
        connectionStatus={connStatus}
        agentStatus={agentStatus}
        machineName={machine.name}
        agentId={agentId}
      />
    </Box>
  );
}
