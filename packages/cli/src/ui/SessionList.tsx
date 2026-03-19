/**
 * Session list overlay — Ctrl+S.
 * Shows all sessions (in-memory + persisted), lets you switch or create new.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { ICONS } from "../lib/theme.js";

export interface SessionInfo {
  id: string;
  title: string;
  provider: string;
  model: string;
  messageCount: number;
  createdAt: number;
  lastActiveAt: number;
}

interface SessionListProps {
  sessions: SessionInfo[];
  currentSessionId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function SessionList({ sessions, currentSessionId, onSelect, onNew, onDelete, onClose }: SessionListProps) {
  // +1 for the "New Session" item at top
  const [selectedIdx, setSelectedIdx] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIdx((prev) => Math.min(sessions.length, prev + 1));
    } else if (key.return) {
      if (selectedIdx === 0) {
        onNew();
      } else {
        const session = sessions[selectedIdx - 1];
        if (session) onSelect(session.id);
      }
    } else if (input === "d" || key.delete) {
      if (selectedIdx > 0) {
        const session = sessions[selectedIdx - 1];
        if (session && session.id !== currentSessionId) {
          onDelete(session.id);
        }
      }
    }
  });

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow">Sessions</Text>
      <Text dimColor>─────────────────────────────────────────</Text>

      {/* New session option */}
      <Box>
        <Text color={selectedIdx === 0 ? "yellow" : undefined}>
          {selectedIdx === 0 ? "▸" : " "} + New Session
        </Text>
      </Box>

      {sessions.length > 0 && <Text dimColor>─────────────────────────────────────────</Text>}

      {sessions.map((s, i) => {
        const isSelected = i + 1 === selectedIdx;
        const isCurrent = s.id === currentSessionId;
        const cursor = isSelected ? "▸" : " ";
        const title = s.title || s.id;
        const truncTitle = title.length > 30 ? title.slice(0, 30) + "…" : title;

        return (
          <Box key={s.id} flexDirection="column">
            <Text color={isSelected ? "yellow" : undefined}>
              {cursor} {truncTitle}
              {isCurrent && <Text color="green"> (active)</Text>}
            </Text>
            <Text dimColor>
              {"    "}{s.provider}/{s.model} · {s.messageCount} msgs · {formatTime(s.lastActiveAt)}
            </Text>
          </Box>
        );
      })}

      {sessions.length === 0 && (
        <Text dimColor>  No sessions yet. Press Enter to create one.</Text>
      )}

      <Text dimColor>─────────────────────────────────────────</Text>
      <Text dimColor>[↑↓] navigate  [Enter] select  [d] delete  [Esc] close</Text>
    </Box>
  );
}
