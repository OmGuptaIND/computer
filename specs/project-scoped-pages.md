# Project-Scoped Pages: Frontend Spec

Everything in the sidebar (Tasks, Memory, Agents, Files, Connectors, Skills) is scoped to the **active project**. Switching projects changes what you see on every page.

---

## Current State

| Page | Status | What Exists |
|------|--------|-------------|
| Tasks (Home) | Done | Split-pane, task list + detail, chat, hero input. **Project-scoped** — filters by `activeProjectId`. |
| Memory | Done | Fetches real data from server via `config_query`. Shows project context (summary + notes) and chat memories (global + conversation) with scope badges and filter tabs. |
| Agents | Built | Split-pane, agent list + detail + run logs. Session creation passes `projectId`. |
| Files | Built | Terminal PTY + file browser. Already project-scoped. |
| Connectors | Built | OAuth/MCP/API setup modal (opens settings) |
| Skills | Stubbed | Components exist, not wired in App.tsx |

---

## The Core Principle

**Project = scope boundary.** When user selects "Twitter Scraper" in the project dropdown, every page shows only data belonging to that project.

```
Project Selector: [Twitter Scraper v]

Tasks    → only Twitter Scraper tasks
Memory   → only Twitter Scraper preferences & memories
Agents   → only Twitter Scraper agents
Files    → only Twitter Scraper files
Connectors → project-level + global connectors
Skills   → all skills (not project-scoped, globally available)
```

---

## Data Flow

### How project scoping works

```
User switches project
  → store.setActiveProjectId(projectId)
  → each page reads activeProjectId from store
  → each page filters its data by projectId
  → UI re-renders with scoped data
```

### Store shape (what each page needs)

```ts
// Core project state
activeProjectId: string | null   // auto-set to default project on load (never null after init)
projects: Project[]              // includes default project with isDefault: true

// Per-page data (filtered by activeProjectId)
conversations: Conversation[]       // Tasks page — filtered in TaskListView by activeProjectId
memories: { name, content, scope }[] // Memory page — fetched from server with projectId
memoriesLoading: boolean
allAgents: AgentSession[]           // Agents page — filter by projectId
projectFiles: FileEntry[]           // Files page — already project-scoped
connectors: ConnectorStatusInfo[]   // Connectors — global + project-level
```

---

## Page-by-Page Flow

### 1. Tasks (activeView: 'home')

**Done.** Project-scoped.

```
Mount → read conversations from store
      → filter where conv.projectId === activeProjectId (in TaskListView useMemo)
      → for default project, also includes legacy conversations without projectId
      → render TaskListView with filtered list

Create task → newConversation(undefined, sessionId, activeProjectId)
            → sendSessionCreate(sessionId, { projectId: activeProjectId })
            → task auto-belongs to current project
            → server stores messages in ~/.anton/projects/{projectId}/conversations/

Select task → load session history → show TaskDetailView
```

**What's remaining:**
- "All projects" toggle to show unfiltered list
- Task count badge in sidebar nav item

### 2. Memory (activeView: 'memory')

**Done.** Wired to server via `config_query`.

```
Mount → useEffect sends config_query('memories', undefined, activeProjectId)
      → server returns global memories + project context (notes, summary)
      → store.setMemories(memories) updates state
      → MemoryView renders with real data

Project switching → useEffect re-fires when activeProjectId changes
                  → fresh fetch with new projectId

Memory auto-created → LLM's `memory` tool saves .md files during chat
                    → scope: 'global' (cross-conversation) or 'conversation' (session-specific)
                    → appears on Memory page with scope badge
```

**Data sources displayed:**
- **Project Context section**: Shows `project.context.summary` and `project.context.notes` from the active project
- **Chat Memories section**: Global memories (`~/.anton/memory/*.md`) + conversation-scoped ones, with filter tabs (All / Global / Conversation)

**What's remaining:**
- Preferences CRUD (user-defined rules that guide AI behavior)
- Memory deletion from the UI
- Searchable/filterable memories by type

### 3. Agents (activeView: 'agents')

**Built.** Needs tighter project scoping.

```
Mount → fetchAllAgents()
      → filter where agent.projectId === activeProjectId
      → render AgentListView with filtered list

Select agent → show AgentDetailView with runs, logs, schedule

Create agent → from task detail ("make this an agent")
             → or from Agents page "+" button
             → tagged with activeProjectId
```

**What's missing:**
- "Create agent" flow from Agents page (currently agents are created from tasks only)
- Agent count badge in sidebar

### 4. Files (activeView: 'files')

**Done.** Redesigned as visual file grid (Perplexity-style).

```
Mount → fetch project files via sendProjectFilesList(activeProjectId)
      → render ProjectFilesView with file cards in a grid
      → file type filter dropdown (All / Code / Data / Documents / Images)

Upload → drag-drop onto page or click Upload button
       → file sent as base64 over WebSocket → saved to project.workspacePath/
       → file list auto-refreshes

Delete → click delete icon on card → confirmation modal → remove from workspace
```

**What changed:**
- Terminal+FileBrowser replaced with `ProjectFilesView` component
- Files shown as visual cards with type icons and color coding
- Drag-and-drop upload support
- Uploaded files now go to `workspacePath/` (same place AI creates files)
- Terminal moved to its own nav item in sidebar

**What's remaining:**
- File preview on click (text inline, images displayed, PDFs linked)
- File count badge in sidebar

### 5. Connectors (activeView: 'connectors')

**Built, but opens as modal.** Should become a first-class page.

```
Mount → load connectors from store
      → show two sections:
        1. Project connectors (enabled for this project)
        2. Available connectors (global registry)

Enable connector → toggle for current project
                 → connector available in this project's tasks

Configure → OAuth flow / API key entry
          → saved globally, enabled per-project
```

**Current behavior:** Clicking "Connectors" in sidebar opens settings modal at connectors tab.
**Target behavior:** Connectors becomes a full page view like Tasks/Memory/Agents.

**What's missing:**
- `activeView === 'connectors'` rendering a page (not a modal)
- Project-level connector enable/disable (currently global only)

### 6. Skills (activeView: 'skills')

**Components exist, not wired.**

```
Mount → loadSkills()
      → render SkillsPanel with searchable grid
      → skills are NOT project-scoped (globally available)

Click skill → open SkillDialog with details
           → "Run" button to execute skill in current project context
```

**What's missing:**
- Render handler in App.tsx for `activeView === 'skills'`
- Page wrapper component (SkillsPanel exists but needs page chrome)
- "Run skill" action that creates a task in current project

---

## Navigation & Sidebar

### Sidebar items in Computer mode

```tsx
const navItems = [
  { id: 'home',       label: 'Tasks',      icon: CheckSquare, badge: taskCount },
  { id: 'memory',     label: 'Memory',     icon: Brain,       badge: memoryCount },
  { id: 'agents',     label: 'Agents',     icon: Bot,         badge: agentCount },
  { id: 'files',      label: 'Files',      icon: Files,       badge: fileCount },
  { id: 'connectors', label: 'Connectors', icon: Link,        badge: connectorCount },
  { id: 'skills',     label: 'Skills',     icon: Puzzle },
]
```

**Active state:** Highlighted background on selected item.
**Badge counts:** Scoped to active project. Update when project changes.

### Project switching flow

```
User clicks project dropdown
  → shows list of projects + "My Computer" + "+ New project"
  → user selects project
  → store.setActiveProjectId(newId)
  → sidebar badges recalculate
  → current page re-renders with new project's data
  → if on Tasks page, task list filters to new project
  → if on Memory page, preferences/memories reload for new project
  → etc.
```

---

## Routing in App.tsx

```tsx
// In the workspace-body render section:
{activeView === 'home' && <HomeView />}             // ✅ Task list, project-scoped
{activeView === 'chat' && <AgentChat />}             // ✅ Chat with project context
{activeView === 'memory' && <MemoryView />}          // ✅ Instructions + Preferences + Memories
{activeView === 'agents' && <AgentsView />}          // ✅ Agent list + detail
{activeView === 'files' && <ProjectFilesView />}     // ✅ Visual file grid with upload
{activeView === 'terminal' && <Terminal + FileBrowser />}  // ✅ Separate nav item
{activeView === 'connectors' && /* opens settings */}
{activeView === 'skills' && /* not yet */}
```

---

## Shared Patterns

### Split-pane layout (reused by Tasks, Agents)

```
┌── List (resizable) ──┬── Detail (flex: 1) ──┐
│ Search + filter       │ Content               │
│ Hero input / actions  │                       │
│ Item list             │ Selected item detail  │
└───────────────────────┴───────────────────────┘
```

- Draggable divider, 25-75% range, min 360px left
- List shows when no item selected (full width) or as sidebar (when item open)

### Empty states (per page, per project)

Each page needs an empty state for when a project has no data:

| Page | Empty State Text | Action |
|------|-----------------|--------|
| Tasks | "No tasks yet. Start one above." | Hero input focused |
| Memory | "No memories yet." | "+ Add preference" button |
| Agents | "No agents in this project." | "Create agent" button |
| Files | "No files yet." | Upload or drag-drop zone |
| Connectors | "No connectors enabled." | Browse available connectors |
| Skills | "Explore available skills." | Skill grid shown by default |

---

## Implementation Order

| # | Task | Status |
|---|------|--------|
| 1 | **Project scoping on Tasks** — Tag conversations with projectId, filter task list | Done |
| 2 | **Memory wired to server** — Fetches real data via config_query with projectId | Done |
| 3 | **Default project ("My Computer")** — Auto-created, isDefault flag, cannot delete | Done |
| 4 | **All session creation passes projectId** — Sidebar, TaskListView, AgentChat, AgentListView | Done |
| 5 | **Skills page wiring** — Add render handler in App.tsx, create SkillsPageView wrapper | Not yet |
| 6 | **Connectors as page** — Move from modal to full page view | Not yet |
| 7 | **Sidebar badges** — Dynamic counts per active project | Not yet |
| 8 | **"All projects" toggle** — On Tasks page, switch between project-scoped and global view | Not yet |
| 9 | **Memory preferences CRUD** — User-defined rules with persistence | Not yet |

---

## What Stays Global (Not Project-Scoped)

- **Skills** — Available everywhere, not tied to a project
- **Settings** — App-wide preferences (theme, model defaults, etc.)
- **Connector registry** — Available connectors are global; *enablement* is per-project
- **Global memories** — Stored in `~/.anton/memory/`, visible from any project's Memory page
- **Chat mode** — Uses the default "My Computer" project (conversations now always have a projectId)
