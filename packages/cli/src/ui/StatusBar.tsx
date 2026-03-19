import { Box, Text } from 'ink'
import type { ConnectionStatus } from '../lib/connection.js'
import { ICONS } from '../lib/theme.js'

interface StatusBarProps {
  connectionStatus: ConnectionStatus
  agentStatus: 'idle' | 'working' | 'error'
  machineName?: string
  agentId?: string
  provider?: string
  model?: string
  sessionId?: string
}

export function StatusBar({
  connectionStatus,
  agentStatus,
  machineName,
  provider,
  model,
  sessionId,
}: StatusBarProps) {
  const connIcon =
    connectionStatus === 'connected'
      ? ICONS.connected
      : connectionStatus === 'connecting' || connectionStatus === 'authenticating'
        ? ICONS.connecting
        : ICONS.disconnected

  return (
    <Box paddingX={1} justifyContent="space-between">
      {/* Left: connection + model info */}
      <Text>
        {connIcon} <Text dimColor>{machineName ?? 'not connected'}</Text>
        {provider && model && (
          <Text dimColor>
            {' '}
            · {provider}/{model}
          </Text>
        )}
        {sessionId && sessionId !== 'default' && <Text dimColor> · {sessionId}</Text>}
      </Text>

      {/* Right: status + keybinding hints */}
      <Text>
        {agentStatus === 'working' ? (
          <Text color="yellow">● working </Text>
        ) : (
          <Text dimColor>idle </Text>
        )}
        <Text dimColor>^P providers · ^M model · ^S sessions · ^Q quit</Text>
      </Text>
    </Box>
  )
}
