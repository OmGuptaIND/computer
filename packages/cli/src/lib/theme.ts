/**
 * CLI theme — colors and styling constants.
 */

import chalk from 'chalk'

export const theme = {
  // Brand
  brand: chalk.hex('#FF6B35'), // anton orange
  brandBold: chalk.hex('#FF6B35').bold,
  brandDim: chalk.hex('#FF6B35').dim,

  // Status
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,

  // Text
  dim: chalk.dim,
  bold: chalk.bold,
  muted: chalk.gray,

  // UI elements
  border: chalk.gray,
  label: chalk.white.bold,
  value: chalk.white,
  highlight: chalk.cyan.bold,

  // Agent
  agentName: chalk.hex('#FF6B35').bold,
  userName: chalk.cyan.bold,
  toolName: chalk.yellow,
  toolResult: chalk.dim,
} as const

export function getLogo(version: string): string {
  const versionStr = `v${version}`
  const versionPad = ' '.repeat(Math.max(0, 11 - versionStr.length))
  return `
  ${theme.brand('┌───────────────────────────┐')}
  ${theme.brand('│')}                           ${theme.brand('│')}
  ${theme.brand('│')}    ${theme.brandBold('╱╲  ╱╲  ╱╲')}             ${theme.brand('│')}
  ${theme.brand('│')}   ${theme.brandBold('╱  ╲╱  ╲╱  ╲')}            ${theme.brand('│')}
  ${theme.brand('│')}   ${theme.brandBold('╲  ╱╲  ╱╲  ╱')}            ${theme.brand('│')}
  ${theme.brand('│')}    ${theme.brandBold('╲╱  ╲╱  ╲╱')}             ${theme.brand('│')}
  ${theme.brand('│')}                           ${theme.brand('│')}
  ${theme.brand('│')}    ${theme.bold('anton.computer')}         ${theme.brand('│')}
  ${theme.brand('│')}    ${theme.dim(versionStr)}${versionPad}            ${theme.brand('│')}
  ${theme.brand('│')}                           ${theme.brand('│')}
  ${theme.brand('└───────────────────────────┘')}
`
}

/** @deprecated Use getLogo(version) instead */
export const LOGO = getLogo('0.1.0')

export const ICONS = {
  connected: theme.success('●'),
  disconnected: theme.error('●'),
  connecting: theme.warning('●'),
  thinking: theme.brand('◆'),
  tool: theme.toolName('▸'),
  toolDone: theme.success('✓'),
  toolError: theme.error('✗'),
  confirm: theme.warning('⚠'),
  prompt: theme.brand('❯'),
  arrow: theme.brand('→'),
} as const
