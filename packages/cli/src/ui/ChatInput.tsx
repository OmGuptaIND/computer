import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { ICONS } from "../lib/theme.js";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <Box paddingX={1}>
      <Text color="#FF6B35">{ICONS.prompt} </Text>
      {disabled ? (
        <Text dimColor>Waiting for agent...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
      )}
    </Box>
  );
}
