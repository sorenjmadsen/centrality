# Data Pipeline & Type Reference

## JSONL Source Format

Claude Code stores session transcripts as JSONL files at:
```
~/.claude/projects/{encoded-project-path}/{session-uuid}.jsonl
```

Each line is a JSON object representing one conversation turn:

```typescript
interface JSONLEntry {
  type: "user" | "assistant" | "summary";
  uuid: string;
  parentUuid?: string;
  timestamp: string;              // ISO 8601
  sessionId: string;
  message: {
    id: string;
    role: "user" | "assistant";
    model?: string;               // e.g. "claude-sonnet-4-20250514"
    content: ContentBlock[];
    stop_reason?: "end_turn" | "tool_use";
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: ToolName; input: Record<string, any> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ToolName =
  | "Read"        // input: { file_path: string }
  | "Write"       // input: { file_path: string, content: string }
  | "Edit"        // input: { file_path: string, old_string: string, new_string: string }
  | "MultiEdit"   // input: { file_path: string, edits: Array<{old_string, new_string}> }
  | "Bash"        // input: { command: string }
  | "Glob"        // input: { pattern: string }
  | "Grep"        // input: { pattern: string, path?: string }
  | "LS"          // input: { path: string }
  | "Agent"       // input: { prompt: string } — subagent spawn
  | "WebFetch"    // input: { url: string }
  | "WebSearch"   // input: { query: string }
  | "TodoRead"    // input: {}
  | "TodoWrite"   // input: { todos: Array }
  | "NotebookRead" | "NotebookEdit";
```

---

## Action Extraction

Parse JSONL into `ClaudeAction` objects. Use Node.js `readline` on a `createReadStream` for memory efficiency (sessions can be 50MB+).

```typescript
interface ClaudeAction {
  id: string;                    // tool_use id
  sessionId: string;
  timestamp: string;
  type: ActionType;
  filePath?: string;             // resolved absolute path
  symbolName?: string;           // if we can determine which function/class was affected
  toolName: ToolName;
  input: Record<string, any>;    // raw input for detail view
  parentActionId?: string;       // for subagent actions
}

enum ActionType {
  READ = "read",
  CREATED = "created",
  EDITED = "edited",
  DELETED = "deleted",           // inferred from Write with empty content or Bash rm
  EXECUTED = "executed",         // Bash commands
  SEARCHED = "searched",         // Glob/Grep/LS
  SPAWNED_AGENT = "spawned",    // Agent tool
}
```

**Action inference rules:**
- `Read` → ActionType.READ
- `Write` → ActionType.CREATED (if file didn't exist) or ActionType.EDITED (if it did)
- `Edit` / `MultiEdit` → ActionType.EDITED. Parse `old_string` / `new_string` to identify which symbols were affected using Tree-sitter on the old vs new content.
- `Bash` → ActionType.EXECUTED. Also scan the command string for file operations: `rm` → DELETED, `mv` → EDITED, `mkdir` → CREATED, `cat` → READ, `touch` → CREATED. Attach the command string for display.
- `Glob` / `Grep` / `LS` → ActionType.SEARCHED
- `Agent` → ActionType.SPAWNED_AGENT

---

## Chat History Parsing

In addition to extracting `ClaudeAction` objects, the JSONL parser also builds a full conversation transcript:

```typescript
interface ChatMessage {
  id: string;                      // uuid from JSONL entry
  parentId?: string;               // parentUuid — for subagent message threading
  role: "user" | "assistant";
  timestamp: string;
  textContent: string;             // concatenated text blocks from message.content
  toolCalls: ToolCallEntry[];      // extracted tool_use blocks (displayed as collapsible inline blocks)
  model?: string;                  // which Claude model produced this response
  tokenUsage?: {
    input: number;
    output: number;
  };
}

interface ToolCallEntry {
  id: string;                      // tool_use id
  toolName: ToolName;
  input: Record<string, any>;
  result?: string;                 // matched from subsequent tool_result block
  associatedAction?: ClaudeAction; // cross-reference to the ClaudeAction derived from this tool call
  affectedFiles: string[];         // file paths touched by this tool call
}

interface ChatExchange {
  id: string;                      // derived from user message id
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  actions: ClaudeAction[];         // all actions that occurred during this exchange
  affectedNodes: string[];         // codebase node IDs touched during this exchange
}
```

**Parsing rules:**
- Walk JSONL entries in order. Group consecutive user→assistant pairs into `ChatExchange` objects.
- For each assistant message, iterate `message.content` blocks. Collect `type: "text"` blocks into `textContent`. Collect `type: "tool_use"` blocks into `toolCalls`.
- Match `tool_result` blocks to their originating `tool_use` via `tool_use_id` and attach as `result`.
- Cross-reference each `ToolCallEntry` to the `ClaudeAction` derived from the same tool call (by matching the tool_use `id`). This links the chat view to the graph.
- Compute `affectedNodes` per exchange by collecting all file paths from tool calls and resolving them to codebase node IDs.

**Subagent threading:** When a `tool_use` has `name: "Agent"`, the subagent's messages appear as subsequent JSONL entries with `parentUuid` referencing the spawning message. Group these into a nested thread within the parent `ChatExchange`, rendered as an indented/collapsible sub-conversation in the chat panel.

---

## Playback State

The playback system uses the ordered list of `ChatExchange` objects as its timeline:

```typescript
interface PlaybackState {
  isPlaying: boolean;
  speed: 1 | 2 | 4;               // multiplier
  currentExchangeIndex: number;    // cursor position in the ChatExchange array
  highlightedNodes: Set<string>;   // codebase node IDs currently highlighted
  cumulativeActions: ClaudeAction[]; // all actions from exchange 0..currentExchangeIndex
}
```

As the playback cursor advances:
1. The chat panel auto-scrolls to the current exchange (highlighted with a distinct border).
2. The graph updates: all nodes touched by `cumulativeActions` up to the cursor show their action badges. Nodes touched in the *current* exchange get the animated pulse effect.
3. Nodes not yet touched in the playback appear in their default (unacted) state — no badges, default border color.

---

## Codebase Structure Parsing

On project load and on file system changes, scan the project directory and build a hierarchical structure:

```typescript
interface CodebaseNode {
  id: string;                    // relative path or path:symbol
  type: "directory" | "file" | "class" | "function" | "method" | "type" | "enum" | "interface" | "struct";
  name: string;
  path: string;                  // relative to project root
  parent?: string;               // parent node id
  children: string[];            // child node ids
  language?: string;
  startLine?: number;
  endLine?: number;
  actions: ClaudeAction[];       // actions that touched this node
}
```

**Tree-sitter integration:**
- Use `web-tree-sitter` with WASM bindings (works in Electron main or renderer).
- Load grammars for: Python, Rust, TypeScript, JavaScript, C, C++.
- For each supported file, parse and extract:
  - **Python:** `class_definition`, `function_definition`, `decorated_definition`
  - **Rust:** `struct_item`, `enum_item`, `impl_item`, `function_item`, `trait_item`, `type_item`
  - **TypeScript/JS:** `class_declaration`, `function_declaration`, `arrow_function` (named), `interface_declaration`, `type_alias_declaration`, `enum_declaration`
  - **C/C++:** `struct_specifier`, `enum_specifier`, `function_definition`, `class_specifier`, `template_declaration`
- For unsupported file types, represent as file-only nodes (no symbol children).

**Performance:** Cache parsed structures per file using `mtime` as cache key. Only re-parse files that changed. Use a worker thread pool for parallel parsing on large codebases.

---

## Git Integration

Using `simple-git`:

- On project load, run `git log --format="%H|%ai|%s" --since="30 days ago"` to get recent commits.
- For each commit overlapping a Claude session's time range, run `git diff --name-status {parent}..{commit}` to get changed files.
- Correlate Claude session timestamps with git commits to build a timeline showing: Claude action → file change → git commit.
- Expose `git diff` for any file at any commit for the DiffPreview component.
- Watch for `.git/HEAD` changes to detect new commits in real time.

```typescript
interface CorrelatedTimeline {
  entries: Array<
    | { type: "claude_action"; action: ClaudeAction }
    | { type: "git_commit"; hash: string; message: string; files: string[] }
  >;
  // Sorted by timestamp, interleaved
}
```

Display in the chat panel as distinct commit markers inserted between chat exchanges at the appropriate chronological position. Git commits use a git-branch icon and a muted visual style distinct from user/assistant messages.

**Diff overlay:** When a user clicks a git commit or an Edit action, show a side-by-side or inline diff. For Edit actions, use `old_string` / `new_string` from tool input. For git commits, use `simple-git`'s diff output. Syntax highlight with `shiki` or `prism`.

---

## Real-Time Updates

### File Watching Pipeline

```
~/.claude/projects/**/*.jsonl
        │
        ▼
   chokidar watcher (main process)
        │
        ├── 'change' event → tail new lines from JSONL
        ├── 'add' event → new session detected, parse full file
        └── 'unlink' event → session removed
        │
        ▼
   Parse new JSONL lines → extract ClaudeActions + ChatMessages
        │
        ▼
   IPC to renderer:
        │
        ├── session-store  → update action list
        ├── chat-store     → append new ChatMessages, rebuild ChatExchanges
        └── graph-store    → add badges, trigger pulse animation
```

**Efficient tailing:** Track byte offset per watched file. On 'change' event, `createReadStream` from last offset, parse only new lines. This avoids re-parsing entire 50MB session files on each update.

### Project Directory Watching

Also watch the actual project directory (resolved from the encoded path in `~/.claude/projects/`) for file system changes:
- New files → add nodes to graph
- Deleted files → mark nodes as deleted (ghost style)
- Modified files → re-parse with tree-sitter to update symbol list

Use a debounced watcher (500ms) to batch rapid changes (e.g., during `npm install`).

---

## Directory Structure

```
claude-vertex/
├── electron/
│   ├── main.ts                  # Electron main process
│   ├── preload.ts               # Context bridge for IPC
│   └── ipc/
│       ├── session-watcher.ts   # Chokidar file watcher on ~/.claude/projects/
│       ├── jsonl-parser.ts      # JSONL stream parser, extracts tool calls
│       ├── tree-sitter-pool.ts  # Tree-sitter parser pool (one per language)
│       └── git-integration.ts   # Git diff/log/blame queries
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── Graph/
│   │   │   ├── CodebaseGraph.tsx     # Main React Flow canvas
│   │   │   ├── nodes/
│   │   │   │   ├── DirectoryNode.tsx  # Collapsible directory container
│   │   │   │   ├── FileNode.tsx       # File node with action badges
│   │   │   │   ├── SymbolNode.tsx     # Class/function/type node (nested inside FileNode)
│   │   │   │   └── BashNode.tsx       # Terminal command node (for non-file actions)
│   │   │   ├── edges/
│   │   │   │   └── DependencyEdge.tsx # Import/call relationship edges
│   │   │   └── overlays/
│   │   │       ├── ActionBadge.tsx    # Read/Edit/Create/Delete icon overlays
│   │   │       ├── PulseAnimation.tsx # Glow effect for recent activity
│   │   │       └── HeatmapLayer.tsx   # Optional heat intensity overlay
│   │   ├── ChatPanel/
│   │   │   ├── ChatPanel.tsx          # Right sidebar: full conversation transcript
│   │   │   ├── ChatMessage.tsx        # Single user or assistant message bubble
│   │   │   ├── ToolCallBlock.tsx      # Collapsible inline block for tool_use entries
│   │   │   ├── PlaybackControls.tsx   # Step forward/back, play/pause, speed, scrubber
│   │   │   └── ChatSearch.tsx         # Search within conversation text
│   │   ├── Controls/
│   │   │   ├── GranularityControl.tsx # Toggle: files / +classes / +functions / +types
│   │   │   └── ActionDetail.tsx       # Expandable detail for selected action/diff
│   │   ├── TopBar/
│   │   │   ├── ProjectTabs.tsx        # Multi-project tab switcher
│   │   │   ├── SessionPicker.tsx      # Dropdown to select session within project
│   │   │   └── FilterBar.tsx          # Filter by action type, time range, file pattern
│   │   └── GitOverlay/
│   │       ├── CommitTimeline.tsx     # Git commits correlated with Claude sessions
│   │       └── DiffPreview.tsx        # Inline diff viewer for changed files
│   ├── stores/
│   │   ├── codebase-store.ts     # Parsed codebase structure (tree-sitter output)
│   │   ├── session-store.ts      # Parsed Claude sessions and actions
│   │   ├── chat-store.ts         # Full conversation messages, playback cursor position
│   │   ├── graph-store.ts        # React Flow nodes/edges state
│   │   ├── ui-store.ts           # Granularity level, filters, selected items
│   │   └── git-store.ts          # Git history and diff data
│   ├── lib/
│   │   ├── action-mapper.ts      # Maps JSONL tool_use events → file/symbol actions
│   │   ├── graph-layout.ts       # Layout algorithm for nested node positioning
│   │   ├── codebase-scanner.ts   # Walks project directory, invokes tree-sitter
│   │   └── session-correlator.ts # Correlates Claude actions with git commits by timestamp
│   └── types/
│       ├── actions.ts            # ClaudeAction, ActionType enums
│       ├── codebase.ts           # FileNode, SymbolNode, Directory types
│       ├── session.ts            # Session, Message, ToolCall types
│       └── chat.ts               # ChatMessage, ChatExchange, PlaybackState types
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts                # Vite for React, electron-vite for Electron
```
