# Centrality

A desktop application for tracing and visualizing how Claude Code interacts with your codebase.

## What it does

Centrality reads Claude Code session files and renders an interactive graph of your project — directories, files, and code symbols — overlaid with every tool call Claude made during a session. You can see exactly which files were read, written, or edited, replay actions chronologically, and correlate AI-assisted changes with git history.

## Features

- **Interactive codebase graph** — visualize your project as a network of directories, files, and symbols (functions, classes, types)
- **Action tracking** — map every Claude tool call (Read, Write, Edit, Bash, Grep, etc.) to the exact nodes it touched
- **Playback mode** — replay a session step-by-step at adjustable speed to follow Claude's reasoning
- **Git integration** — view commits and diffs alongside session activity to see what actually changed
- **Multi-tab sessions** — open and compare multiple Claude Code sessions simultaneously
- **Chat panel** — read the full conversation with per-exchange token usage and cache statistics
- **Granularity control** — switch between directory, file, and symbol-level views
- **SSH remote support** — connect to a remote machine and analyze sessions running there
- **Export** — save sessions as markdown or capture graph screenshots
- **Auto-updates** — built-in update checking and one-click installation

## Installation

### Download a release

Pre-built binaries are available on the [GitHub Releases](../../releases) page:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (universal) |
| Windows | `.exe` (NSIS installer) |
| Linux | `.AppImage` / `.deb` |

### Build from source

Requires Node.js 20 or later.

```bash
git clone https://github.com/sorenmadsen/centrality.git
cd centrality
npm install
npm run dev
```

To produce a distributable package:

```bash
npm run build
```

## Getting started

1. Launch Centrality.
2. The dashboard lists Claude Code projects detected under `~/.claude/projects/`. If your projects are saved somewhere else, you can configure that in settings.
3. Pick a project and a session file to open. Each session corresponds to a single Claude Code conversation.
4. The codebase graph loads with your project's structure. Nodes highlight as you step through the session.
5. Use the chat panel on the right to read the conversation and click any exchange to jump to that point in the graph.
6. Open **Settings** to configure file exclusion patterns (e.g. `node_modules`, `dist`) or add an SSH remote.

Note: Due to File Descriptor restrictions, Centrality will recommend that you add patterns to the exclusion list.

## Contributing

Contributions are welcome. Please follow these conventions:

- Branch off `main` and open a pull request when ready.
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `refactor:`.
- Keep pull requests focused — one logical change per PR.
- Run `npm run test` before submitting and ensure no type errors (`npm run typecheck` if available).

For bugs or feature requests, open an issue on GitHub.
