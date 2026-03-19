/**
 * Model picker overlay — Ctrl+M.
 * Shows all available models grouped by provider.
 * Supports custom model entry for providers like OpenRouter.
 */

import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useMemo, useState } from 'react'
import type { ProviderInfo } from './ProviderPanel.js'

interface ModelPickerProps {
  providers: ProviderInfo[]
  currentProvider: string
  currentModel: string
  onSelect: (provider: string, model: string) => void
  onClose: () => void
}

interface FlatItem {
  provider: string
  model: string
  isHeader: boolean
  isCustom?: boolean
}

export function ModelPicker({
  providers,
  currentProvider,
  currentModel,
  onSelect,
  onClose,
}: ModelPickerProps) {
  const [customMode, setCustomMode] = useState(false)
  const [customModel, setCustomModel] = useState('')
  const [customProvider, setCustomProvider] = useState('')

  // Flatten providers + models into a selectable list
  const items = useMemo(() => {
    const flat: FlatItem[] = []
    for (const p of providers) {
      // Show provider if it has a key or a baseUrl
      if (!p.hasApiKey && !p.baseUrl) continue

      flat.push({ provider: p.name, model: '', isHeader: true })

      for (const m of p.models) {
        flat.push({ provider: p.name, model: m, isHeader: false })
      }

      // Always add a "custom model..." option for each provider
      flat.push({ provider: p.name, model: 'custom...', isHeader: false, isCustom: true })
    }
    return flat
  }, [providers])

  const selectableIndices = items.map((item, i) => (!item.isHeader ? i : -1)).filter((i) => i >= 0)
  const [selectedPos, setSelectedPos] = useState(0)

  useInput((_input, key) => {
    if (customMode) return // TextInput handles input

    if (key.escape) {
      onClose()
      return
    }

    if (key.upArrow) {
      setSelectedPos((prev) => Math.max(0, prev - 1))
    } else if (key.downArrow) {
      setSelectedPos((prev) => Math.min(selectableIndices.length - 1, prev + 1))
    } else if (key.return) {
      const idx = selectableIndices[selectedPos]
      if (idx !== undefined && items[idx]) {
        const item = items[idx]
        if (item.isCustom) {
          setCustomMode(true)
          setCustomProvider(item.provider)
          setCustomModel('')
        } else {
          onSelect(item.provider, item.model)
        }
      }
    }
  })

  const handleCustomSubmit = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) {
      onSelect(customProvider, trimmed)
    }
    setCustomMode(false)
  }

  const selectedIdx = selectableIndices[selectedPos]

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        Select Model
      </Text>
      <Text dimColor>─────────────────────────────────</Text>

      {items.map((item, i) => {
        if (item.isHeader) {
          return (
            <Box key={`h-${item.provider}`} marginTop={i > 0 ? 1 : 0}>
              <Text bold dimColor>
                {item.provider}:
              </Text>
            </Box>
          )
        }

        const isSelected = i === selectedIdx
        const isCurrent = item.provider === currentProvider && item.model === currentModel
        const cursor = isSelected ? '▸' : ' '

        if (item.isCustom) {
          return (
            <Box key={`${item.provider}-custom`}>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {'  '}
                {cursor} enter custom model name...
              </Text>
            </Box>
          )
        }

        return (
          <Box key={`${item.provider}-${item.model}`}>
            <Text color={isSelected ? 'cyan' : undefined}>
              {'  '}
              {cursor} {item.model}
              {isCurrent && <Text color="green"> (current)</Text>}
            </Text>
          </Box>
        )
      })}

      <Text dimColor>─────────────────────────────────</Text>

      {customMode ? (
        <Box>
          <Text color="cyan">Model name for {customProvider}: </Text>
          <TextInput
            value={customModel}
            onChange={setCustomModel}
            onSubmit={handleCustomSubmit}
            placeholder="e.g. anthropic/claude-3.5-sonnet"
          />
        </Box>
      ) : (
        <Text dimColor>[↑↓] navigate [Enter] select [Esc] cancel</Text>
      )}
    </Box>
  )
}
