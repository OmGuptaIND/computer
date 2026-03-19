import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { useState } from 'react'
import { ICONS } from '../lib/theme.js'
import { Spinner } from './Spinner.js'

interface ChatInputProps {
  onSubmit: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <Box paddingX={1}>
      {disabled ? (
        <Spinner label="Thinking" />
      ) : (
        <>
          <Text color="#FF6B35">{ICONS.prompt} </Text>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder="Type a message..."
          />
        </>
      )}
    </Box>
  )
}
