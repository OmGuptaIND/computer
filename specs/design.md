# Anton Design System

Design language inspired by modern dark-theme product UIs (Huddle01, Linear, Raycast). This document defines the typography, spacing, and component patterns used across Anton.

## Typography

### Font Stack
- **Primary**: `Inter` (loaded via Google Fonts, weights 400-700)
- **Mono**: `"SF Mono", "JetBrains Mono", Menlo, monospace`
- **Fallback**: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`

### Type Scale

| Token         | Size   | Weight | Letter-spacing | Use case                     |
|---------------|--------|--------|----------------|------------------------------|
| `display`     | 26px   | 600    | -0.03em        | Modal/page titles            |
| `heading`     | 18px   | 600    | -0.02em        | Section headers              |
| `subheading`  | 15px   | 500    | -0.01em        | Card titles, labels          |
| `body`        | 14px   | 400    | 0              | Default text                 |
| `body-small`  | 13px   | 400    | 0              | Secondary descriptions       |
| `caption`     | 12px   | 500    | 0.02em         | Hints, metadata, tab labels  |
| `micro`       | 11px   | 500    | 0.03em         | Badges, tiny labels          |

### Key Principles
- **Tight tracking on headings** (`-0.02em` to `-0.03em`) for a modern, dense feel
- **Regular tracking on body** for readability
- **Slightly wide tracking on captions** for small-caps / uppercase labels
- **Anti-aliased rendering**: always use `-webkit-font-smoothing: antialiased`
- **Line heights**: headings `1.2`, body `1.5`, captions `1.3`

## Color Tokens (Dark)

Already defined in CSS variables. Key additions for onboarding:
- Tab active: `var(--text)` (white)
- Tab inactive: `var(--text-subtle)` (#6b6b6b)
- Input background: `rgba(var(--overlay), 0.06)`
- Input border: `rgba(var(--overlay), 0.1)`
- Input focus border: `rgba(var(--overlay), 0.25)`

## Component Patterns

### Tab Navigation (Wizard/Stepper)
- Horizontal tabs at the top, icon + label per tab
- Active tab: white text, subtle bottom indicator
- Inactive tab: muted text, no indicator
- Tabs are clickable for completed steps only

### Form Inputs
- Height: 44px
- Border-radius: 10px
- Background: `rgba(var(--overlay), 0.06)`
- Border: `1px solid rgba(var(--overlay), 0.1)`
- Focus: border shifts to `rgba(var(--overlay), 0.25)`
- Placeholder: `var(--text-subtle)`
- Font size: 14px

### Buttons
- Primary: solid white bg, dark text, 44px height, radius 12px
- Secondary: transparent with muted border, radius 12px
- Icon buttons: inline icon next to label, 6px gap

### Cards
- Background: `rgba(var(--overlay), 0.04)`
- Border: `1px solid rgba(var(--overlay), 0.08)`
- Border-radius: `var(--radius-md)` (14px)
- Hover: background shifts to `0.08`, border to `0.14`

### Spacing
- Section gap: 24px
- Card internal padding: 16px
- Input label to input: 8px
- Between form fields: 16px

## Onboarding Flow

Tab-based wizard with 4 steps:
1. **About You** - Role selection as cards
2. **Try These** - Suggested prompts based on role
3. **Connect** - Tool integrations showcase
4. **Setup** - Model configuration

Navigation: tabs at top (non-linear for completed), Next/Back buttons at bottom.

## Icons
- Library: `lucide-react`
- Default size: 18px
- Default strokeWidth: 1.5
- No background containers unless semantically grouped
