# Implementation Phases & Technical Decisions

## Phase 1: Foundation (MVP)

**Goal:** Electron app that parses JSONL, displays a file-level graph with action overlays, and shows the full chat transcript.

1. Scaffold Electron + React + TypeScript + Vite project using `electron-vite`.
2. Implement JSONL parser that extracts both `ClaudeAction` objects and full `ChatMessage`/`ChatExchange` transcript.
3. Build file-system scanner that creates a directory/file tree from the project path.
4. Implement React Flow graph with DirectoryNode and FileNode custom nodes.
5. Map `ClaudeAction`s to file nodes — display color-coded borders and badge icons.
6. Build the ChatPanel right sidebar: render full conversation with user/assistant messages, inline collapsible tool call blocks, markdown rendering for assistant text.
7. Implement bidirectional chat↔graph linking: click tool call file path → highlight graph node; click graph node → scroll chat to relevant exchange.
8. Build project discovery: scan `~/.claude/projects/`, decode directory names, list in a picker.
9. Build session picker dropdown.

**Deliverable:** User can select a project and session, see a file tree graph with colored action badges, and read the full conversation alongside it with clickable cross-references.

---

## Phase 2: Real-Time + Playback + Polish

**Goal:** Live updates, playback mode, animations, and interaction refinements.

1. Implement chokidar watcher with efficient byte-offset tailing.
2. Add pulse/glow animations on new actions.
3. **Implement playback mode:** scrubber over ChatExchange list, step forward/back, play/pause, speed control. Graph progressively accumulates action badges as cursor advances, with pulse on current exchange's actions. Chat auto-scrolls to cursor position.
4. Implement click-exchange-to-highlight: clicking a chat exchange highlights all affected nodes on graph.
5. Add filter bar (by action type, time range, file glob pattern).
6. Implement multi-project tabs with lazy loading.
7. Add React Flow minimap and zoom controls.
8. Implement ELK-based hierarchical layout.
9. Add subagent thread rendering in chat panel (indented, collapsible sub-conversations).

**Deliverable:** Real-time updating graph with playback mode, full interactivity, and multi-project support.

---

## Phase 3: Symbol-Level Granularity

**Goal:** Tree-sitter integration for class/function/type visibility.

1. Set up `web-tree-sitter` with WASM grammars for Python, Rust, TS/JS, C/C++.
2. Implement codebase scanner that parses files and extracts symbol hierarchies.
3. Build SymbolNode custom React Flow node.
4. Implement granularity toggle (directories → files → classes/functions → all symbols).
5. For Edit actions, diff `old_string` vs `new_string` against the parsed symbol tree to determine which specific symbols were affected.
6. Cache parsed trees per file (keyed on mtime).

**Deliverable:** User can zoom into symbol-level detail and see which specific functions/classes Claude touched.

---

## Phase 4: Git Integration

**Goal:** Correlate Claude sessions with git history.

1. Integrate `simple-git` for log, diff, and blame queries.
2. Add git commit markers into the chat panel timeline — display commits as distinct entries between chat exchanges, positioned by timestamp, showing hash, message, and changed files.
3. Implement diff preview: clicking a git commit marker or an Edit tool call block opens an inline diff viewer (syntax-highlighted, side-by-side or unified toggle).
4. Add git commit overlay on graph (highlight files changed per commit).
5. Watch `.git/HEAD` for new commit detection.

**Deliverable:** Chat panel shows git commits interleaved with conversation exchanges, with diff previews and graph highlighting.

---

## Phase 5: Advanced Features

**Goal:** Power user features and performance optimization.

1. **Dependency edges:** Parse import statements to draw edges between files/modules on the graph.
2. **Search:** Full-text search across Claude's prompts and responses in the chat panel, with jump-to-result in both chat and graph.
3. **Export:** Export graph as SVG/PNG, export session summary (conversation + actions) as markdown.
4. **Session comparison:** Side-by-side view of two sessions on the same project, showing which files each session touched differently.
5. **Token usage overlay:** Optional badge on chat exchanges showing token cost per exchange, with a cumulative sparkline in the playback controls area.
6. **Performance:** Virtualize large graphs (React Flow handles this natively), virtualize long chat transcripts (react-window), lazy-load symbol parsing, use Web Workers for tree-sitter.

---

## Configuration

Store user preferences in `~/.claude-vertex/config.json`:

```json
{
  "claudeDir": "~/.claude",
  "theme": "system",
  "defaultGranularity": "files",
  "defaultLayout": "tree",
  "watchDebounceMs": 500,
  "maxSessionsToLoad": 50,
  "excludePatterns": ["node_modules", ".git", "dist", "build", "__pycache__"],
  "treeSitterLanguages": ["python", "rust", "typescript", "javascript", "c", "cpp"],
  "gitIntegration": true,
  "gitHistoryDays": 30
}
```

---

## Key Technical Decisions & Rationale

1. **React Flow over D3.js or Cytoscape:** React Flow is purpose-built for node-based graphs in React. It handles zoom/pan/minimap/selection out of the box, supports custom node components (critical for our nested file→symbol hierarchy), and has first-class support for grouped/nested nodes. D3 would require building all interaction handling from scratch. Cytoscape lacks the React component model we need for rich node content.

2. **ELK for layout:** The Eclipse Layout Kernel handles hierarchical compound graphs (nodes containing nodes) which maps perfectly to our directory→file→symbol hierarchy. It runs in a Web Worker, keeping the UI thread free.

3. **Tree-sitter WASM over native bindings:** WASM bindings work identically in Electron's main and renderer processes without native compilation issues. Slightly slower than native but eliminates build complexity across platforms.

4. **Zustand over Redux:** Lighter weight, less boilerplate, perfect for the 4-5 focused stores we need. Supports subscriptions for React Flow integration.

5. **Byte-offset tailing over re-parsing:** Critical for performance with large session files. A single Claude Code session can generate 50MB+ of JSONL. Re-parsing on every change would be unusable.

6. **electron-vite:** Provides HMR for both main and renderer processes during development, with optimized production builds.
