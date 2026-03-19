/**
 * Provider management panel — Ctrl+P overlay.
 * Lists configured providers, lets you add/edit API keys.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { ICONS } from "../lib/theme.js";

export interface ProviderInfo {
  name: string;
  models: string[];
  hasApiKey: boolean;
  baseUrl?: string;
}

interface ProviderPanelProps {
  providers: ProviderInfo[];
  defaults: { provider: string; model: string };
  onSetKey: (provider: string, apiKey: string) => void;
  onClose: () => void;
}

export function ProviderPanel({ providers, defaults, onSetKey, onClose }: ProviderPanelProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editingKey, setEditingKey] = useState(false);
  const [keyValue, setKeyValue] = useState("");

  useInput((input, key) => {
    if (editingKey) return;

    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIdx((prev) => Math.min(providers.length - 1, prev + 1));
    } else if (input === "e" || key.return) {
      setEditingKey(true);
      setKeyValue("");
    }
  });

  const handleKeySubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && providers[selectedIdx]) {
      onSetKey(providers[selectedIdx].name, trimmed);
    }
    setEditingKey(false);
    setKeyValue("");
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#FF6B35"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="#FF6B35">Providers</Text>
      <Text dimColor>─────────────────────────────────</Text>

      {providers.map((p, i) => {
        const isSelected = i === selectedIdx;
        const isDefault = p.name === defaults.provider;
        const cursor = isSelected ? "▸" : " ";
        const keyStatus = p.hasApiKey ? ICONS.connected : ICONS.disconnected;
        const keyHint = p.hasApiKey
          ? (p.baseUrl ? p.baseUrl : "configured")
          : "(no key)";

        return (
          <Box key={p.name}>
            <Text color={isSelected ? "#FF6B35" : undefined}>
              {cursor} {keyStatus} {p.name.padEnd(14)}{" "}
              <Text dimColor>{keyHint}</Text>
              {isDefault && <Text color="cyan"> (default)</Text>}
            </Text>
          </Box>
        );
      })}

      <Text dimColor>─────────────────────────────────</Text>

      {editingKey ? (
        <Box>
          <Text color="yellow">API Key for {providers[selectedIdx]?.name}: </Text>
          <TextInput
            value={keyValue}
            onChange={setKeyValue}
            onSubmit={handleKeySubmit}
            mask="*"
          />
        </Box>
      ) : (
        <Text dimColor>
          [↑↓] navigate  [e] edit key  [Esc] close
        </Text>
      )}
    </Box>
  );
}
