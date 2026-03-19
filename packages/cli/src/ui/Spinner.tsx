/**
 * Animated spinner for showing agent is working.
 * Like Claude Code's thinking indicator.
 */

import { Text } from 'ink'
import { useEffect, useState } from 'react'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface SpinnerProps {
  label?: string
  color?: string
}

export function Spinner({ label = 'Thinking', color = '#FF6B35' }: SpinnerProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return (
    <Text>
      <Text color={color}>{SPINNER_FRAMES[frame]} </Text>
      <Text color={color}>{label}...</Text>
    </Text>
  )
}
