# Home Page Rendering Spec

Defines the data, components, and state needed to render the Home page in both layouts: **full-width task list** (no task selected) and **split-pane** (task selected).

---

## Page Layouts

### Layout 1: Full-Width Task List (no task open)

```
┌─────────────────────────────────────────────────────────┐
│  All tasks                                    [🔍]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  What should we work on next?                   │    │
│  │                                                 │    │
│  │  [+] [connectors pill] [⌘K] [Model ▾] [➤]      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─ Check ─┬─ Status ────────┬─ Task ──────┬─ Updated ─┐
│  │  □      │ ✅ Completed    │ Hey         │ 1m ago    │
│  │  □      │ ○ Idle         │ New convo   │ 1m ago    │
│  └─────────┴────────────────┴─────────────┴───────────┘│
└─────────────────────────────────────────────────────────┘
```

### Layout 2: Split-Pane (task open)

```
┌── Left (resizable 25-75%) ──┬── Right (flex 1) ────────────────────┐
│ All tasks             [🔍]  │  ← Hey             [...] [📊] [🔒]  │
│                             │                                      │
│ [Hero ChatInput]            │  User: Hey Hey                       │
│                             │  Assistant: Hey! What can I help...  │
│ ✅ Hey          just now    │                                      │
│ ○ New convo    2m ago       │  User: Can you check my github repos │
│                             │  > Checking GitHub repos now!        │
│                             │  > Github_list_repos                 │
│                             │  You've got 2 repos: ...             │
│                             │                                      │
│                             │  ┌────────────────────────────┐      │
│                             │  │ Type a command...     [➤]  │      │
│                             │  └────────────────────────────┘      │
└─────────────────────────────┴──────────────────────────────────────┘
```

---

## Data Requirements

### From Zustand Store (`useStore`)

| Field | Type | Used For |
|---|---|---|
| `conversations` | `Conversation[]` | Populates task list rows |
| `activeConversationId` | `string` | Highlight active row; decide layout mode |
| `sessionStatuses` | `Map<string, {status, detail?}>` | Derive task status (working/completed/error/idle) |
| `projects` | `Project[]` | (Available, not currently rendered in table) |
| `currentTasks` | `Task[]` | Todo dropdown in detail view topbar |
| `artifacts` | `Artifact[]` | File count badge in detail view topbar |
| `pendingConfirm` | `{id, command, reason, sessionId?}` | Confirm dialog overlay in detail view |
| `pendingAskUser` | `{id, questions[], sessionId?}` | Ask-user inline form in detail ChatInput |
| `_syncingSessionIds` | `Set<string>` | Loading spinner when session history is being fetched |
| `currentProvider` | `string` | Passed to session create |
| `currentModel` | `string` | Displayed in ModelSelector |
| `connectors` | `Connector[]` | ConnectorPill/Banner in hero input |

### Conversation Object Shape

```ts
interface Conversation {
  id: string
  title: string
  sessionId?: string
  projectId?: string
  messages: Message[]
  createdAt: number
  updatedAt?: number
}
```

### Message Object Shape

```ts
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isError?: boolean
  toolCalls?: ToolCall[]
  attachments?: ChatImageAttachment[]
  citations?: Citation[]
}
```

### Task Status Derivation

```ts
type TaskStatus = 'working' | 'completed' | 'error' | 'idle'

function getTaskStatus(sessionId, sessionStatuses, messages): TaskStatus {
  if (!sessionId) return 'idle'
  if (sessionStatuses.get(sessionId)?.status === 'working') return 'working'
  if (messages.length === 0) return 'idle'
  const lastAssistant = messages.findLast(m => m.role === 'assistant' || m.role === 'system')
  if (lastAssistant?.isError) return 'error'
  return 'completed'
}
```

---

## Component Tree

```
HomeView
├── TaskListView (mode="full" | "compact")
│   ├── Header ("All tasks" + search toggle)
│   ├── SelectionBar (if any tasks selected)
│   ├── Search Input (if search toggled)
│   ├── ChatInput (variant="hero")
│   │   ├── Textarea ("What should we work on next?")
│   │   ├── Toolbar Left: [+] attach, ConnectorPill
│   │   ├── Toolbar Right: ⌘K hint, ModelSelector, Send button
│   │   ├── ConnectorBanner (below composer)
│   │   └── SlashCommandMenu (overlay, on "/" input)
│   ├── Task Table (full mode) — or — Task Row List (compact mode)
│   │   └── Per row:
│   │       ├── SelectionCheckbox
│   │       ├── StatusIcon (SVG: checkmark / spinner / x / empty circle)
│   │       ├── Status Label ("Completed" / "Working" / "Error" / "Idle")
│   │       ├── Task Title (conversation.title || "New task")
│   │       ├── Relative Time ("just now" / "1m ago" / "2h ago" / "yesterday")
│   │       └── TaskMenu (three-dot: Pin, Rename, Delete)
│   └── Empty State ("No tasks yet. Start one above.")
│
└── TaskDetailView (only when hasOpenTask)
    ├── Topbar
    │   ├── Back button (ArrowLeft → deselect task)
    │   ├── Title (conversation.title)
    │   └── Action buttons: [...] MoreHorizontal, [📊] BarChart3, [☑] ListChecks (todo), [🔒] Lock
    │       └── Todo Dropdown (if currentTasks.length > 0)
    ├── Message Area
    │   ├── MessageList (scrollable, auto-scroll)
    │   │   └── Per message: MessageBubble → ToolCallBlock, MarkdownRenderer, Citations
    │   ├── ConfirmDialog (if pendingConfirm)
    │   └── PlanReviewOverlay (if pendingPlan)
    └── ChatInput (variant="minimal")
        ├── Textarea ("Type a command...")
        ├── [+] attach button
        ├── Send/Stop button
        └── AskUserInline (if pendingAskUser)
```

---

## Resizable Split Pane

- **Divider**: 4px wide drag handle between left and right panels
- **Left width**: stored in `useState`, default = `max(400px, 32% of window)`
- **Constraints**: min 25% / max 75% of window width, floor 360px
- **Drag behavior**: mousedown on divider → track mousemove → mouseup to release
- **Body style during drag**: `cursor: col-resize`, `user-select: none`

---

## ChatInput Variants

| Variant | Placeholder | Toolbar Left | Toolbar Right | Used In |
|---|---|---|---|---|
| `hero` | "What should we work on next?" | [+] attach, ConnectorPill | ⌘K, ModelSelector, Send | TaskListView (both modes) |
| `minimal` | "Type a command..." | [+] attach | Send or Stop | TaskDetailView |
| `docked` | "Ask a follow-up" | [+] attach, Plan toggle | Send or Stop | AgentChat (not on home) |

---

## Status Icons

| Status | Visual | CSS |
|---|---|---|
| `completed` | Green circle + checkmark SVG | `var(--success)` fill 15% + stroke |
| `working` | Pulsing orange dot (animated) | `status-icon--working` keyframe |
| `error` | Red circle + X SVG | `var(--danger)` fill 15% + stroke |
| `idle` | Empty gray circle | `var(--text-subtle)` opacity 0.4 |

---

## Actions / Store Methods

| Action | Store Method | Trigger |
|---|---|---|
| Select a task | `switchConversation(id)` + `requestSessionHistory(sessionId)` | Click task row |
| Deselect (back) | `switchConversation('')` | Back button in detail topbar |
| Create new task | `newConversation()` → `connection.sendSessionCreate()` → `switchConversation()` → `addMessage()` → `connection.sendAiMessageToSession()` | Submit hero ChatInput |
| Delete task | `deleteConversation(id)` | TaskMenu → Delete |
| Bulk delete | Loop `deleteConversation(id)` for each selected | SelectionBar → Delete |
| Send follow-up | `addMessage()` → `connection.sendAiMessageToSession()` | Submit minimal ChatInput |
| Steer (while working) | `connection.sendSteerMessage()` | Submit input while agent is working |
| Cancel turn | `connection.sendCancelTurn()` | Stop button |
| Approve/Deny confirm | `connection.sendConfirmResponse()` | ConfirmDialog buttons |
| Answer ask-user | `connection.sendAskUserResponse()` | AskUserInline submit |

---

## Key CSS Classes

| Class | Element |
|---|---|
| `.home-layout` | Root flex container (row) |
| `.home-layout__left` | Left panel (full width or constrained) |
| `.home-layout__divider` | Drag handle between panels |
| `.home-layout__right` | Right panel (flex: 1) |
| `.task-list-full` | Full-mode wrapper |
| `.task-panel` | Compact-mode wrapper |
| `.task-table` | Table container (header + body) |
| `.task-table__row` | Clickable task row |
| `.task-row` | Compact-mode task row |
| `.task-row--active` | Highlighted active row |
| `.conv-panel` | Detail view container |
| `.conv-panel__topbar` | Detail top bar (back + title + actions) |
| `.conv-panel__messages` | Scrollable message area |
| `.conv-panel__input` | Bottom input area |
| `.composer` | ChatInput root |
| `.composer--hero` | Hero variant styling |
| `.composer--minimal` | Minimal variant styling |
| `.composer__box` | Input box container |
| `.composer__textarea` | The actual textarea |
| `.composer__toolbar` | Button row below textarea |

---

## WebSocket Dependencies

The home page requires an active WebSocket connection for:

1. **Session creation**: `sendSessionCreate(sessionId, {provider, model})` — when user submits hero input
2. **AI messaging**: `sendAiMessageToSession(text, sessionId, attachments?)` — send user prompt
3. **Session history**: `requestSessionHistory(sessionId)` — load messages when clicking a task
4. **Session status**: `sessionStatuses` map updated via WS events — drives status icons
5. **Confirm/AskUser**: `sendConfirmResponse()`, `sendAskUserResponse()` — interactive prompts
6. **Steer/Cancel**: `sendSteerMessage()`, `sendCancelTurn()` — control running sessions

---

## Relative Time Formatting

```ts
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

---

## External Dependencies

| Package | Used For |
|---|---|
| `lucide-react` | All icons (ArrowLeft, Search, MoreHorizontal, Send, etc.) |
| `react` | Component framework |
| `zustand` | State management via `useStore` |
| `@anton/protocol` | Type definitions (AskUserQuestion, etc.) |
| `framer-motion` | Animations (used in MessageList, not directly in home components) |
| `react-markdown` + `remark-gfm` | Markdown rendering in messages |
| `shiki` | Syntax highlighting in code blocks |
