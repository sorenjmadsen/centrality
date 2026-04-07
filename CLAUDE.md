# Centrality

Cross-platform Electron app that visualizes how Claude Code interacts with a codebase. Parses session transcripts from `~/.claude/projects/` and overlays Claude's actions onto an interactive graph of the code structure (files → classes → functions). The full conversation appears in a right sidebar with inline tool call blocks, bidirectionally linked to the graph.

## Tech Stack

- **Shell:** Electron (electron-vite)
- **Frontend:** React + TypeScript + Tailwind CSS
- **Graph:** React Flow (`@xyflow/react`) + elkjs for layout
- **Code Parsing:** Tree-sitter (web-tree-sitter WASM) — Python, Rust, TS/JS, C/C++
- **State:** Zustand
- **Git:** simple-git
- **File Watching:** chokidar

## Architecture

- `electron/` — Main process: JSONL parser, file watcher, tree-sitter pool, git integration
- `src/components/Graph/` — React Flow canvas, custom nodes (Directory, File, Symbol, Bash), overlays
- `src/components/ChatPanel/` — Right sidebar conversation transcript with collapsible tool calls, playback controls
- `src/components/TopBar/` — Project tabs, session picker, filters, granularity control
- `src/stores/` — Zustand stores: codebase, session, chat, graph, ui, git
- `src/lib/` — Action mapper, graph layout, codebase scanner, session-git correlator
- `src/types/` — TypeScript interfaces for actions, codebase, session, chat

## Key Data Flow

JSONL files → parse into `ClaudeAction` + `ChatMessage`/`ChatExchange` → map actions to codebase nodes → render graph with action badges + chat panel with inline tool blocks. Bidirectional linking: click chat tool call → highlight graph node; click graph node → scroll to chat exchange.

## Reference Docs

Full specifications live in `docs/` — read these before implementing a feature area:
- `docs/SPEC.md` — Data pipeline, JSONL format, TypeScript interfaces, parsing rules
- `docs/UI.md` — Layout, chat panel details, graph visualization, interactions, visual encoding
- `docs/PHASES.md` — Implementation phases, technical decisions, configuration

## Current Phase: Phase 1 (Foundation MVP)

1. Scaffold Electron + React + TypeScript project with electron-vite
2. Implement JSONL parser → `ClaudeAction` + `ChatMessage`/`ChatExchange` objects
3. Build file-system scanner → directory/file tree from project path
4. React Flow graph with DirectoryNode and FileNode custom nodes
5. Map actions to file nodes → color-coded borders + badge icons
6. ChatPanel right sidebar: conversation with inline collapsible tool call blocks, markdown rendering
7. Bidirectional chat↔graph linking
8. Project discovery: scan `~/.claude/projects/`, decode directory names
9. Session picker dropdown

## Conventions

- TypeScript strict mode, no `any` unless interfacing with external untyped data
- Zustand stores in `src/stores/`, one per domain (no monolithic store)
- React Flow custom nodes as separate files in `src/components/Graph/nodes/`
- All IPC between main↔renderer via typed channels defined in `electron/preload.ts`
- Use `lucide-react` for icons (matches action badge icon set)
- Test with Vitest
