import { Box, Text, useInput } from 'ink'
import { useState } from 'react'
import { ICONS } from '../lib/theme.js'

interface ConfirmPromptProps {
  id: string
  command: string
  reason: string
  onRespond: (id: string, approved: boolean) => void
}

export function ConfirmPrompt({ id, command, reason, onRespond }: ConfirmPromptProps) {
  const [responded, setResponded] = useState(false)

  useInput((input, key) => {
    if (responded) return

    if (input === 'y' || input === 'Y') {
      setResponded(true)
      onRespond(id, true)
    } else if (input === 'n' || input === 'N' || key.escape) {
      setResponded(true)
      onRespond(id, false)
    }
  })

  if (responded) return null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={0}>
      <Text color="yellow" bold>
        {ICONS.confirm} Agent wants to run:
      </Text>
      <Text bold> {command}</Text>
      <Text dimColor> Reason: {reason}</Text>
      <Text>
        <Text color="green" bold>
          [y]
        </Text>
        <Text> approve </Text>
        <Text color="red" bold>
          [n]
        </Text>
        <Text> deny</Text>
      </Text>
    </Box>
  )
}
