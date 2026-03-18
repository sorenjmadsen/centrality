# UI Specification

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [Tab: project-a] [Tab: project-b] [+]          [Session ▾]  │
│ [Filter: action types] [Time range] [File pattern] [Granul.]│
├──────────────────────────────────┬───────────────────────────┤
│                                  │ Chat History              │
│                                  │ ┌───────────────────────┐ │
│                                  │ │ 👤 "Fix the auth bug" │ │
│                                  │ │                       │ │
│                                  │ │ 🤖 Let me look at the │ │
│    Interactive Graph Canvas      │ │    auth module...      │ │
│    (React Flow)                  │ │  ▶ Read auth.py       │ │
│                                  │ │  ▶ Edit auth.py       │ │
│                                  │ │  ▶ Read test_auth.py  │ │
│                                  │ │                       │ │
│                                  │ │ 👤 "Now add tests"    │ │
│                                  │ │                       │ │
│                                  │ │ 🤖 I'll add unit...   │ │
│                                  │ │  ▶ Edit test_auth.py  │ │
│                                  │ │  ▶ Bash pytest        │ │
│                                  │ └───────────────────────┘ │
│                                  │                           │
│                                  │ ◀◀ ▶ ▶▶  ━━━●━━━  1x    │
│                                  │ Playback: Exchange 2 of 5 │
├──────────────────────────────────┴───────────────────────────┤
│ Minimap                                        [Zoom: 100%] │
└──────────────────────────────────────────────────────────────┘
```

---

## Chat Panel (Right Sidebar)

The chat panel replaces a traditional action timeline. It shows the full conversation transcript for the selected session. Tool calls appear inline within assistant messages, serving as the chronological action log.

### ChatMessage Rendering

- **User messages:** Subtle background tint, showing prompt text. Truncate long prompts with "Show more."
- **Assistant messages:** Different background. Text content renders as markdown (code blocks, inline code, bold, etc.) via `react-markdown`.
- **Tool call blocks:** Rendered inline within assistant messages, at the position they appeared in the content stream. Each block shows:
  - Action icon + color (same as graph badges: eye for Read, pencil for Edit, etc.)
  - File path (clickable — pans graph to that node and highlights it)
  - Collapse/expand toggle
  - When expanded: full tool input (syntax-highlighted JSON or formatted), result/output text, and for Edit/MultiEdit actions, a compact inline diff view
- **Subagent threads:** When an `Agent` tool call appears, the subagent's conversation renders as an indented, collapsible sub-thread with a visual nesting indicator (left border line, slightly muted colors).

### Playback Controls

Docked at the bottom of the chat panel:
- Scrubber/slider spanning the full `ChatExchange` list
- Step-back (◀◀), play/pause (▶), step-forward (▶▶)
- Speed toggle (1x/2x/4x)
- Label: "Exchange N of M"

---

## Graph Visualization

### React Flow Node Hierarchy

```
[Project Root Group]
  ├── [Directory Group Node] ← collapsible
  │     ├── [File Node] ← shows action badges
  │     │     ├── [Symbol Node: class Foo] ← nested, togglable via granularity
  │     │     │     ├── [Symbol Node: method bar()]
  │     │     │     └── [Symbol Node: method baz()]
  │     │     └── [Symbol Node: function helper()]
  │     └── [File Node]
  └── [Directory Group Node]
```

### Node Types

1. **DirectoryNode** — Collapsible container with folder icon. Shows aggregate action count badge. Background color intensity reflects how "hot" the directory is.
2. **FileNode** — Shows filename, language icon, and action badges along the top edge. Border color reflects most recent action type. Contains nested SymbolNodes when granularity is set to show them.
3. **SymbolNode** — Compact node showing symbol type icon (class/function/type) and name. Action badges appear inline. Only visible when user's granularity setting includes that level.
4. **BashNode** — Floating node in a separate "Commands" lane for non-file-targeting bash commands. Shows truncated command text.

### Visual Encoding

**Color coding for action types:**

| Action | Node Border Color | Badge Color | Badge Icon |
|--------|------------------|-------------|------------|
| Read | `#3B82F6` (blue) | Blue | Eye icon |
| Created | `#22C55E` (green) | Green | Plus icon |
| Edited | `#F59E0B` (amber) | Amber | Pencil icon |
| Deleted | `#EF4444` (red) | Red | Trash icon |
| Searched | `#8B5CF6` (purple) | Purple | Search icon |
| Executed | `#6B7280` (gray) | Gray | Terminal icon |

**Animated pulse:** When a new action arrives in real-time, the affected node gets a 2-second animated glow/pulse in the action's color:
```css
@keyframes pulse-glow {
  0% { box-shadow: 0 0 0 0 rgba(var(--action-color), 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(var(--action-color), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--action-color), 0); }
}
```

**Multiple actions on one node:** Stack badges horizontally. Most recent action determines border color. Badge shows count if same action occurred multiple times (e.g., "Read ×3").

### Granularity Control

A segmented toggle (in top bar or controls area) with 4 levels:

1. **Directories only** — Only directory group nodes shown
2. **+ Files** — Directories expanded to show file nodes (default)
3. **+ Classes & Functions** — File nodes expanded to show top-level symbols
4. **+ All Symbols** — Full depth: methods within classes, nested types, etc.

Changing granularity should animate smoothly — nodes expand/collapse with React Flow's built-in transitions.

### Layout Algorithm

Use a **compound/nested layout** approach:
- Top level: Directories arranged in a grid or tree layout (configurable).
- Within directories: Files arranged vertically or in a compact grid.
- Within files: Symbols listed vertically with indentation for nesting.

Implement using `elkjs` (Eclipse Layout Kernel for JS) which supports hierarchical/compound graph layouts natively and integrates well with React Flow. ELK handles the nested group layout that would be complex to implement manually.

---

## Chat ↔ Graph Interactions

### Bidirectional Linking

- **Click a chat exchange** → All codebase nodes touched during that exchange get highlighted on the graph with a temporary bright border. The graph pans to center on the cluster of affected nodes.
- **Click a tool call's file path in chat** → Graph pans to and highlights that specific node. The action badge on that node pulses once.
- **Click a graph node** → Chat panel scrolls to the first exchange where that node was acted upon, and highlights the relevant tool call block.
- **Click action badge on graph node** → Chat panel scrolls to the specific tool call, expands it.

### Playback Interaction

As the playback cursor advances through exchanges:
- The graph cumulatively builds up action badges
- The current exchange's actions get the animated pulse effect
- Chat auto-scrolls to keep the current exchange visible
- Nodes not yet touched appear in their default (unacted) state

### Other Interactions

- **Hover graph node** → Tooltip with file path, action summary, last modified
- **Right-click graph node** → Context menu: "Open in editor", "Show git history", "Filter to this file"
- **Double-click directory node** → Toggle expand/collapse
- **Click git commit (in git overlay)** → Highlight all files changed in that commit on the graph

---

## Multi-Project Support

- Each open project gets a tab in the top bar
- Project tabs show: project name (last directory segment), active session count, unread action count
- "+" button opens a project picker that scans `~/.claude/projects/` and lists discovered projects
- Each tab maintains independent graph state, selected session, filters, and granularity
- Projects load lazily — only parse JSONL and scan codebase when a tab is first selected

## Session Management

- Dropdown in the top bar lists all sessions for the current project, sorted by most recent
- Each session shows: start time, message count, summary (from session index if available)
- "All sessions" option overlays actions from all sessions with different opacity/color per session
- "Live" indicator appears next to a session if its JSONL file is actively being written to
