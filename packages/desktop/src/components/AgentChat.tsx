import React, { useState, useEffect, useRef } from "react";
import { connection } from "../lib/connection.js";
import { useAgentStatus, type ChatMessage } from "../lib/store.js";
import { Channel } from "@anton/protocol";

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<{ id: string; command: string; reason: string } | null>(null);
  const agentStatus = useAgentStatus();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to AI channel messages
  useEffect(() => {
    return connection.onMessage((channel, msg) => {
      if (channel !== Channel.AI) return;

      switch (msg.type) {
        case "text":
          setMessages((prev) => [
            ...prev,
            { id: `msg_${Date.now()}`, role: "assistant", content: msg.content, timestamp: Date.now() },
          ]);
          break;

        case "thinking":
          setMessages((prev) => [
            ...prev,
            { id: `think_${Date.now()}`, role: "system", content: `Thinking: ${msg.text}`, timestamp: Date.now() },
          ]);
          break;

        case "tool_call":
          setMessages((prev) => [
            ...prev,
            {
              id: `tc_${msg.id}`,
              role: "tool",
              content: `Running: ${msg.name}`,
              toolName: msg.name,
              toolInput: msg.input,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "tool_result":
          setMessages((prev) => [
            ...prev,
            {
              id: `tr_${msg.id}`,
              role: "tool",
              content: msg.output,
              isError: msg.isError,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "confirm":
          setPendingConfirm({ id: msg.id, command: msg.command, reason: msg.reason });
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            { id: `err_${Date.now()}`, role: "system", content: msg.message, isError: true, timestamp: Date.now() },
          ]);
          break;

        case "done":
          // Agent finished — could add a subtle indicator
          break;
      }
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: `user_${Date.now()}`, role: "user", content: text, timestamp: Date.now() },
    ]);

    connection.sendAiMessage(text);
    setInput("");
    inputRef.current?.focus();
  };

  const handleConfirm = (approved: boolean) => {
    if (!pendingConfirm) return;
    connection.sendConfirmResponse(pendingConfirm.id, approved);

    setMessages((prev) => [
      ...prev,
      {
        id: `confirm_${Date.now()}`,
        role: "system",
        content: approved
          ? `Approved: ${pendingConfirm.command}`
          : `Denied: ${pendingConfirm.command}`,
        timestamp: Date.now(),
      },
    ]);

    setPendingConfirm(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.container}>
      {/* Messages */}
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>Your cloud computer is ready</p>
            <p style={styles.emptyHint}>
              Tell it what to do. It will execute commands, manage files, and complete tasks on your server.
            </p>
            <div style={styles.examples}>
              {[
                "Check disk usage and clean up if needed",
                "Install nginx and set up a reverse proxy",
                "Find all log files larger than 100MB",
                "Deploy the app from github.com/user/repo",
              ].map((example) => (
                <button
                  key={example}
                  style={styles.exampleButton}
                  onClick={() => { setInput(example); inputRef.current?.focus(); }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={getMessageStyle(msg)}>
            {msg.role === "tool" && msg.toolName && (
              <div style={styles.toolHeader}>
                <span style={styles.toolIcon}>&#9881;</span>
                <span style={styles.toolName}>{msg.toolName}</span>
                {msg.toolInput && (
                  <span style={styles.toolInput}>
                    {msg.toolName === "shell"
                      ? (msg.toolInput as any).command
                      : JSON.stringify(msg.toolInput).slice(0, 80)}
                  </span>
                )}
              </div>
            )}
            {msg.role === "tool" && !msg.toolName && (
              <pre style={styles.toolOutput}>{msg.content}</pre>
            )}
            {msg.role !== "tool" && (
              <div style={styles.messageContent}>
                {msg.isError && <span style={styles.errorIcon}>&#9888; </span>}
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {/* Confirmation dialog */}
        {pendingConfirm && (
          <div style={styles.confirmBox}>
            <p style={styles.confirmTitle}>Agent needs approval</p>
            <p style={styles.confirmReason}>{pendingConfirm.reason}</p>
            <code style={styles.confirmCommand}>{pendingConfirm.command}</code>
            <div style={styles.confirmButtons}>
              <button style={styles.denyButton} onClick={() => handleConfirm(false)}>Deny</button>
              <button style={styles.approveButton} onClick={() => handleConfirm(true)}>Approve</button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <div style={styles.statusBar}>
          <span style={{
            ...styles.statusDot,
            background: agentStatus === "working" ? "#eab308" : agentStatus === "idle" ? "#22c55e" : "#ef4444",
          }} />
          <span style={styles.statusText}>
            {agentStatus === "working" ? "Agent working..." : agentStatus === "idle" ? "Ready" : "Error"}
          </span>
        </div>
        <div style={styles.inputRow}>
          <textarea
            ref={inputRef}
            style={styles.textarea}
            placeholder="Tell your agent what to do..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            style={styles.sendButton}
            onClick={sendMessage}
            disabled={!input.trim() || agentStatus === "working"}
          >
            &#9654;
          </button>
        </div>
      </div>
    </div>
  );
}

function getMessageStyle(msg: ChatMessage): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "8px 14px",
    marginBottom: 4,
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: "100%",
    wordBreak: "break-word",
  };

  switch (msg.role) {
    case "user":
      return { ...base, background: "#1e3a5f", color: "#93c5fd", alignSelf: "flex-end" };
    case "assistant":
      return { ...base, background: "#18181b", color: "#e4e4e7", border: "1px solid #27272a" };
    case "tool":
      return { ...base, background: "#09090b", color: "#a1a1aa", fontFamily: "monospace", fontSize: 12 };
    case "system":
      return { ...base, background: msg.isError ? "#450a0a" : "#09090b", color: msg.isError ? "#fca5a5" : "#71717a", fontSize: 12, fontStyle: "italic" };
    default:
      return base;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#0a0a0a",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 16px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#fafafa",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: "#71717a",
    marginBottom: 24,
    maxWidth: 360,
  },
  examples: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    width: "100%",
    maxWidth: 400,
  },
  exampleButton: {
    padding: "10px 14px",
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 8,
    color: "#a1a1aa",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left" as const,
  },
  messageContent: {
    whiteSpace: "pre-wrap" as const,
  },
  toolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  toolIcon: {
    fontSize: 12,
    color: "#eab308",
  },
  toolName: {
    fontWeight: 600,
    color: "#eab308",
    fontSize: 12,
  },
  toolInput: {
    color: "#71717a",
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  toolOutput: {
    margin: 0,
    whiteSpace: "pre-wrap" as const,
    fontSize: 12,
    color: "#a1a1aa",
    maxHeight: 200,
    overflow: "auto",
  },
  errorIcon: {
    color: "#ef4444",
  },
  confirmBox: {
    padding: 16,
    background: "#1c1917",
    border: "1px solid #854d0e",
    borderRadius: 10,
    marginBottom: 8,
  },
  confirmTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#fbbf24",
    marginBottom: 6,
  },
  confirmReason: {
    fontSize: 13,
    color: "#a1a1aa",
    marginBottom: 8,
  },
  confirmCommand: {
    display: "block",
    padding: "8px 12px",
    background: "#09090b",
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 13,
    color: "#fafafa",
    marginBottom: 12,
  },
  confirmButtons: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  denyButton: {
    padding: "6px 16px",
    background: "#27272a",
    border: "1px solid #3f3f46",
    borderRadius: 6,
    color: "#e4e4e7",
    cursor: "pointer",
    fontSize: 13,
  },
  approveButton: {
    padding: "6px 16px",
    background: "#22c55e",
    border: "none",
    borderRadius: 6,
    color: "#000",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },
  inputArea: {
    borderTop: "1px solid #27272a",
    padding: "8px 16px 16px",
    background: "#09090b",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
  },
  statusText: {
    fontSize: 11,
    color: "#71717a",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    padding: "10px 14px",
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 10,
    color: "#fafafa",
    fontSize: 14,
    fontFamily: "inherit",
    resize: "none" as const,
    outline: "none",
    minHeight: 42,
    maxHeight: 120,
  },
  sendButton: {
    padding: "10px 14px",
    background: "#22c55e",
    border: "none",
    borderRadius: 10,
    color: "#000",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 600,
    minWidth: 42,
    height: 42,
  },
};
