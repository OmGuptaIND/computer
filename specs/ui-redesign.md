# UI Redesign: Perplexity-Inspired Task UI + Project Power

## Status: Phase 1 Complete

Phase 1 (sidebar + task list + routing + tool calls) is implemented and builds cleanly.
Remaining work tracked below.

---

## What's Been Built

### Phase 1 (Done)

1. **Store changes** (`packages/desktop/src/lib/store.ts`)
   - Added `activeMode: 'chat' | 'computer'` with localStorage persistence
   - Widened `activeView` to include `'home' | 'files' | 'connectors' | 'skills'`
   - Default view is now `'home'` (task list) instead of `'chat'`
   - Added `allAgents` state with client-side fan-out fetch across projects
   - Updated all WS handlers (agents_list_response, agent_created/updated/deleted) to accumulate into allAgents
   - Updated both reset functions (resetForDisconnect, resetForMachineSwitch)

2. **Sidebar restructure** (`packages/desktop/src/components/Sidebar.tsx`)
   - Mode switcher at top: Chat / Computer (persisted to localStorage)
   - Computer mode: fixed nav items (Tasks, Projects, Files, Connectors, Skills)
   - Chat mode: conversation history (Today/Yesterday/Older groups)
   - "+ New task" button always visible
   - Bottom bar: Settings, Usage

3. **Task list view** (`packages/desktop/src/components/home/TaskListView.tsx`)
   - Table with columns: Status, Task, Project, Updated
   - Status derived from sessionStatuses (working/completed/error/idle)
   - Search/filter toggle
   - Hero input at top ("Start a task" using ChatInput variant="hero")
   - Click a task → navigates to chat view

4. **App.tsx routing**
   - Home view (TaskListView) is the default
   - Topbar hidden on home view
   - ModeSelector removed from topbar (replaced by sidebar mode switcher)
   - Fetches all agents on connect

5. **Enhanced ToolCallBlock** (`packages/desktop/src/components/chat/ToolCallBlock.tsx`)
   - Perplexity-style single-line tool actions with action-specific icons
   - Icon per action type (not just per tool): reading=BookOpen, writing=Upload, git=GitBranch, etc.
   - Human-readable labels: "Reading src/config.ts" not "filesystem read"
   - Compact expandable results with success/error indicators

6. **CSS** (`packages/desktop/src/index.css`)
   - Sidebar mode switcher styles
   - Sidebar nav item styles
   - Task list view + task table styles
   - Tool action line styles
   - Tool result inline styles
   - Tool result card styles (shell, filesystem, generic)

---

## What's Left to Build

### Phase 2: Task Detail Split-Pane (Perplexity-style)

Based on user's Perplexity screenshots, the task detail view should be:

```
┌──────────────────────────────────────────────────────────────────┐
│  ← All tasks    Task Name            📄 4  📊 Usage  ☑ Todo  🔗  │
│                                                                  │
│  ┌──────────────────────┬───────────────────────────────────────┐│
│  │                      │                                       ││
│  │ [Big prompt area     │  Agent work stream                    ││
│  │  with the original   │  (tool calls, text, ask-user cards)   ││
│  │  task text]          │                                       ││
│  │                      │  ┌ Reading src/config.ts ›           ││
│  │ ┌────────────────┐   │  ┌ Writing to dist/main.js ›        ││
│  │ │ + attachment    │   │                                       ││
│  │ │           [⏎]   │   │  "Now building the frontend..."      ││
│  │ └────────────────┘   │                                       ││
│  │                      │  ┌──────────────────────────────────┐ ││
│  │ Task list below:     │  │ Type a command...           [⏎]  │ ││
│  │ ● Working ·          │  └──────────────────────────────────┘ ││
│  │   Personal CRM       │                                       ││
│  │   5d ago             │                                       ││
│  └──────────────────────┴───────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**Top bar buttons:**
- Files count badge (📄 4)
- Usage button
- Todo dropdown — checklist popover showing task progress
- Share button

**Left pane:**
- Original prompt (big text)
- Follow-up input
- Previous tasks below (compact list)

**Right pane:**
- Agent work stream (messages + tool calls)
- Chat input at bottom ("Type a command...")

### Phase 3: Perplexity-Style Tool Call Groups

From user screenshots, tool calls should support grouping:

```
-< Running tasks in parallel  ›
   │
   ├── 📋 Reading skills/shared/05-taste.md  ›
   │
   ├── 📋 Reading skills/shared/08-standards.md  ›
   │
   └── 📋 Reading webapp/references/sidebar_rules.md  ›     Mar 26, 11:02 PM · 1s
```

Features:
- Parent group header: "Running tasks in parallel" with branch icon + collapse chevron
- Child items connected with tree branch lines (L-shaped connectors)
- Each child expandable to show its result
- Timestamp + duration shown on the right side of the group or last child
- Collapsed state: single line with `›` chevron
- Expanded state: tree with children visible

### Phase 4: Ask-User Inline Cards (Perplexity-style)

Instead of a modal dialog, ask-user should render as an inline card in the chat:

```
┌──────────────────────────────────────────────────────────────┐
│ Let me nail down the details for your personal CRM           │
│                                                              │
│ 1  What kind of contacts do you want to track?               │
│    [Professional network] [Personal contacts] [Other]        │
│                                                              │
│ 2  How should follow-up reminders work?                      │
│    [Visual indicators] [Category-based] [Both (Rec.)] [Other]│
│                                                              │
│ 3  Any design preferences?                                   │
│    [Dark mode, minimal] [Light & professional] [Other]       │
└──────────────────────────────────────────────────────────────┘
```

Features:
- Numbered questions
- Pill-button options (not radio buttons)
- "Other" option always available
- Inline in the chat flow (not a modal)
- After answering, shows user's selections as a regular user message

### Phase 5: Todo Dropdown (Top Bar)

Replace the inline TaskChecklist with a popover dropdown from the top bar:

```
┌──────────────────────────────────────┐
│ Personal CRM Web App                 │
│                                      │
│ ✓ Set up project from webapp template│
│ ✓ Design data schema                 │
│ ✓ Build backend API routes           │
│ ◎ Build frontend: sidebar, contacts  │
│ ◎ Style with light theme             │
│ ○ Start dev server and run QA        │
│ ○ Deploy and share                   │
└──────────────────────────────────────┘
```

States: ✓ completed, ◎ in progress (with spinner), ○ pending

### Phase 6: Remove Artifacts Panel, Integrate Files

The current side panel (artifacts/plan/context/browser/devmode) should be redesigned:
- Artifacts → become "Files" in the task detail top bar (count badge, click to see produced files)
- Browser viewer → stays as-is but moves to a tab in right pane
- Plan review → becomes inline card (like ask-user)
- Dev tools → stays as modal/dropdown

### Phase 7: Projects Hero View

Enhance project cards:
- Show agent count, task count, active/idle status
- Click → filtered task list + project config tabs (instructions, memory, files, agents)

---

## Design References (from Perplexity screenshots)

### Sidebar
- Two modes at top: Search / Computer (our: Chat / Computer)
- Fixed nav items: + New Task, Tasks, Files, Connectors, Skills
- No conversation history in sidebar (that's in Tasks view)

### Task List
- Clean table: Status, Task, Files, Updated
- "Start a task" input at top with ⌘K shortcut
- Status indicators: green check (completed), orange dot (working), red (error)

### Task Detail
- Split pane: left = prompt + task list, right = agent work stream
- Top bar: back button, task name, files badge, usage, todo, share
- Chat input at bottom of right pane

### Tool Calls
- Single-line per action with action-specific icon + descriptive label + chevron
- Groupable: "Running tasks in parallel" with tree branch connectors
- Timestamp + duration on the right
- Expandable to see result content

### Ask User
- Inline card (not modal)
- Numbered questions with pill-button options
- Clean, minimal styling

### Todo
- Top-bar dropdown popover
- Checklist with ✓/◎/○ states
- Task title at top
