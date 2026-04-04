# Files Page Redesign

## Problem

The Files page currently shows a raw terminal + filesystem browser starting at `/root`. This is:
- Not scoped to the project
- Confusing for non-technical users
- Not how files should work on a "computer" product

Perplexity shows files as visual cards grouped by date with thumbnails. Claude Projects shows a knowledge panel with file names and types. Anton should show **project workspace files** as a clean, browsable list.

## Current State

```
Files page = Terminal component + FileBrowser component (side by side)
- Terminal: raw PTY, starts at $HOME
- FileBrowser: filesystem tree, starts at /root
- Neither scoped to project
```

## Target State

```
Files page = Project files grid/list (like Perplexity)
- Shows files in project.workspacePath
- Visual cards with file type icons and previews
- Upload button (drag-drop or picker)
- Group by date or type
- Click to preview/download
- Terminal moves to its own sidebar tab or bottom panel
```

## Design

### Files Page Layout

```
Files                                              [Upload] [+ New file]

Files in your project workspace. Browse, upload, and manage.

[All types v]  [Grid | List]

Today
┌──────────┐  ┌──────────┐  ┌──────────┐
│  .py     │  │  .csv    │  │  .json   │
│          │  │          │  │          │
│ scraper  │  │ output   │  │ config   │
│ 2.4 KB   │  │ 156 KB   │  │ 0.8 KB   │
└──────────┘  └──────────┘  └──────────┘

Yesterday
┌──────────┐  ┌──────────┐
│  .pdf    │  │  .md     │
│          │  │          │
│ api-spec │  │ README   │
│ 45 KB    │  │ 1.2 KB   │
└──────────┘  └──────────┘
```

### File Type Icons/Colors

| Extension | Icon | Color |
|-----------|------|-------|
| .py, .js, .ts | Code icon | Blue |
| .csv, .json, .yaml | Data icon | Green |
| .md, .txt, .log | Text icon | Gray |
| .pdf | PDF icon | Red |
| .png, .jpg, .svg | Image icon | Purple |
| .html, .css | Web icon | Orange |

### Upload Flow

1. Drag files onto the page — or click "Upload" button
2. Files uploaded to server → saved to `project.workspacePath/`
3. File list refreshes automatically
4. Upload progress indicator for large files

### Terminal Relocation

Terminal moves to:
- **Option A**: Its own nav item ("Terminal" in sidebar) — separate from Files
- **Option B**: Bottom panel (toggleable) within the chat/task view — like VS Code's terminal
- **Option C**: Accessible from within task detail view only

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Replace Files view with `ProjectFilesView` — visual card grid, type icons, color coding, file type filter | Done |
| **Phase 2** | Upload support — drag-and-drop + Upload button, base64 over WebSocket, saves to `workspacePath/` | Done |
| **Phase 3** | Delete support — delete icon on cards, confirmation modal, removes from workspace | Done |
| **Phase 4** | Terminal relocation — moved to its own "Terminal" nav item in sidebar, spawns in project workspace | Done |
| **Phase 5** | File previews — click to preview text, images, PDFs | Not yet |
| **Phase 6** | File actions — download, rename, three-dot menu | Not yet |

### Key Files

| File | Purpose |
|------|---------|
| `packages/desktop/src/components/files/ProjectFilesView.tsx` | New Files page component |
| `packages/agent-config/src/projects.ts` | `saveProjectFile()` now writes to `workspacePath/` |
| `packages/desktop/src/App.tsx` | `activeView === 'files'` renders `ProjectFilesView` |
| `packages/desktop/src/components/Sidebar.tsx` | Terminal added as separate nav item |

## Reference

- **Perplexity**: Visual file cards grouped by date, thumbnail previews, "All types" filter
- **Claude Projects**: Right panel with file list, type badges, add/remove
- **VS Code**: File explorer tree + integrated terminal at bottom
