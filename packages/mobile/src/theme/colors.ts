/**
 * Color palette for the Anton mobile app.
 * Dark-first design matching the desktop app aesthetic.
 */

export const colors = {
  // Backgrounds
  bg: '#0a0a0a',
  bgSecondary: '#141414',
  bgTertiary: '#1a1a1a',
  bgElevated: '#1e1e1e',
  bgHover: '#252525',

  // Surfaces
  surface: '#1a1a1a',
  surfaceHover: '#222222',
  surfaceActive: '#2a2a2a',

  // Text
  text: '#f5f5f5',
  textSecondary: '#a0a0a0',
  textTertiary: '#666666',
  textInverse: '#0a0a0a',

  // Borders
  border: '#2a2a2a',
  borderLight: '#333333',
  borderFocus: '#555555',

  // Accents
  accent: '#3b82f6',
  accentDim: '#1e3a5f',
  accentText: '#93c5fd',

  // Status
  success: '#22c55e',
  successDim: '#14532d',
  warning: '#f59e0b',
  warningDim: '#78350f',
  error: '#ef4444',
  errorDim: '#7f1d1d',

  // Chat bubbles
  userBubble: '#1e3a5f',
  assistantBubble: '#1a1a1a',
  systemBubble: '#1c1917',
  toolBubble: '#14181e',
  thinkingBubble: '#1a1520',

  // Misc
  working: '#f59e0b',
  skeleton: '#1e1e1e',
  overlay: 'rgba(0,0,0,0.6)',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  title: 28,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const
