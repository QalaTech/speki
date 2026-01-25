# Architecture

## Overview

Qala is a TypeScript application with three main components:

1. **CLI** (`bin/qala.ts`) - Command-line interface for all operations
2. **Core** (`src/core/`) - Business logic for decomposition and execution
3. **Server** (`src/server/`) - Express API for the web dashboard
4. **Web** (`web/`) - React dashboard for visual management

## Directory Structure

```
qala/
├── bin/
│   └── qala.ts                 # CLI entry point
├── src/
│   ├── cli/
│   │   └── commands/           # CLI command implementations
│   │       ├── init.ts
│   │       ├── decompose.ts
│   │       ├── start.ts
│   │       ├── stop.ts
│   │       ├── status.ts
│   │       ├── list.ts
│   │       ├── dashboard.ts
│   │       ├── activate.ts
│   │       └── unregister.ts
│   ├── core/
│   │   ├── project.ts          # Per-project state management
│   │   ├── registry.ts         # Global project registry
│   │   ├── claude/
│   │   │   ├── runner.ts       # Claude CLI orchestration
│   │   │   ├── stream-parser.ts # JSONL stream parsing
│   │   │   └── types.ts        # Claude output types
│   │   ├── decompose/
│   │   │   ├── runner.ts       # Decomposition orchestration
│   │   │   └── peer-review.ts  # Codex peer review
│   │   └── ralph-loop/
│   │       └── runner.ts       # Main execution loop
│   ├── server/
│   │   ├── index.ts            # Express server setup
│   │   ├── middleware/
│   │   │   └── project-context.ts
│   │   └── routes/
│   │       ├── projects.ts     # /api/projects
│   │       ├── tasks.ts        # /api/tasks
│   │       ├── decompose.ts    # /api/decompose
│   │       └── ralph.ts        # /api/ralph
│   └── types/
│       └── index.ts            # Shared TypeScript types
├── web/                        # React dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── utils/
│   └── dist/                   # Built dashboard (served by Express)
└── templates/                  # Init templates
    ├── prompt.md               # Ralph agent instructions
    └── standards/              # Language coding standards
```

## Data Flow

### Project Initialization

```
qala init
    │
    ▼
┌─────────────────────┐
│   Create .speki/    │
│   - config.json     │
│   - standards/      │
│   - prompt.md       │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ Register in         │
│ ~/.qala/projects.json│
└─────────────────────┘
```

### Decomposition Flow

```
qala decompose <prd.md>
    │
    ▼
┌─────────────────────┐
│ Read PRD content    │
│ Build prompt        │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ Call Claude CLI     │
│ (no tools, JSON out)│
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ Extract JSON        │
│ Save to tasks/      │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐     ┌──────────────────┐
│ Peer Review (Codex) │────▶│ If FAIL: Revise  │
│ Compare PRD↔Tasks   │     │ with feedback    │
└─────────────────────┘     └──────────────────┘
    │                              │
    ▼                              │
┌─────────────────────┐            │
│ Save final tasks    │◀───────────┘
│ Update state        │
└─────────────────────┘
```

### Execution Flow (Ralph Loop)

```
qala start
    │
    ▼
┌─────────────────────┐
│ Load prd.json       │
│ Find next story     │
│ (priority, deps)    │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ Generate prompt     │
│ from template       │
└─────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Claude CLI (stream-json)            │
│ - Read story + standards            │
│ - Implement code                    │
│ - Run tests                         │
│ - Commit changes                    │
│ - Update prd.json (passes: true)    │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────┐
│ Check completion    │
│ <promise>COMPLETE   │
│ </promise>          │
└─────────────────────┘
    │
    ├──▶ All done? Exit
    │
    └──▶ More stories? Loop
```

## Key Classes

### Registry (`src/core/registry.ts`)

Manages the global project registry at `~/.qala/projects.json`.

```typescript
class Registry {
  static async load(): Promise<ProjectRegistry>
  static async save(registry: ProjectRegistry): Promise<void>
  static async register(path: string, name: string): Promise<void>
  static async unregister(path: string): Promise<void>
  static async updateStatus(path: string, status: ProjectStatus): Promise<void>
  static async list(): Promise<ProjectEntry[]>
}
```

### Project (`src/core/project.ts`)

Manages per-project state in `.speki/`.

```typescript
class Project {
  projectPath: string
  spekiDir: string
  configPath: string
  prdPath: string
  progressPath: string
  // ... other paths

  static async load(projectPath: string): Promise<Project>
  async loadPRD(): Promise<PRDData | null>
  async savePRD(prd: PRDData): Promise<void>
  async loadStatus(): Promise<RalphStatus>
  async saveStatus(status: RalphStatus): Promise<void>
  // ... other methods
}
```

### Claude Runner (`src/core/claude/runner.ts`)

Orchestrates Claude CLI execution with stream parsing.

```typescript
async function runClaude(options: {
  promptPath: string
  cwd: string
  logDir: string
  iteration: number
  callbacks?: StreamCallbacks
}): Promise<{
  jsonlPath: string
  fullText: string
  isComplete: boolean
  durationMs: number
}>
```

### Stream Parser (`src/core/claude/stream-parser.ts`)

Parses Claude's `--output-format stream-json` JSONL output in real-time.

```typescript
async function parseStream(
  stream: Readable,
  callbacks: StreamCallbacks
): Promise<ParsedOutput>

interface StreamCallbacks {
  onText?: (text: string) => void
  onToolCall?: (name: string, detail: string) => void
  onToolResult?: (result: string) => void
  onError?: (error: Error) => void
}
```

## API Endpoints

### Projects (`/api/projects`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all registered projects |

### Tasks (`/api/tasks`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks?project=<path>` | Get active PRD tasks |
| PUT | `/api/tasks?project=<path>` | Update entire PRD |
| GET | `/api/tasks/drafts` | List task drafts |
| POST | `/api/tasks/activate/:filename` | Activate a draft |

### Decompose (`/api/decompose`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/decompose/prd-files` | List available PRD files |
| GET | `/api/decompose/state` | Get decomposition state |
| POST | `/api/decompose/start` | Start decomposition |
| GET | `/api/decompose/feedback` | Get peer review feedback |
| GET | `/api/decompose/review-logs` | Get review log files |
| POST | `/api/decompose/execute-task` | Execute a single task |
| DELETE | `/api/decompose/task/:taskId` | Delete a task from draft |

### Ralph (`/api/ralph`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ralph/status` | Get execution status |
| POST | `/api/ralph/start` | Start Ralph loop |
| POST | `/api/ralph/stop` | Stop Ralph loop |
| GET | `/api/ralph/progress` | Get progress.txt content |
| GET | `/api/ralph/logs` | List log files |
| GET | `/api/ralph/logs/:filename` | Get specific log file |

## State Files

### `prd.json` - Active Task List

```json
{
  "projectName": "string",
  "branchName": "string",
  "language": "string",
  "standardsFile": "string",
  "description": "string",
  "userStories": [
    {
      "id": "US-001",
      "title": "string",
      "description": "string",
      "acceptanceCriteria": ["string"],
      "testCases": ["string"],
      "priority": 1,
      "passes": false,
      "notes": "",
      "dependencies": ["US-000"]
    }
  ]
}
```

### `decompose_state.json` - Decomposition Status

```json
{
  "status": "IDLE|DECOMPOSING|REVIEWING|COMPLETED|ERROR",
  "message": "string",
  "prdFile": "string",
  "draftFile": "string",
  "verdict": "PASS|FAIL|UNKNOWN|SKIPPED"
}
```

### `.speki-status.json` - Execution Status

```json
{
  "status": "idle|running|completed|error",
  "currentIteration": 0,
  "maxIterations": 25,
  "currentStory": "US-001",
  "startedAt": "ISO8601",
  "pid": 12345
}
```

## Claude Integration

Qala uses the Claude Code CLI with the following flags:

```bash
claude \
  --dangerously-skip-permissions \
  --print \
  --verbose \
  --output-format stream-json \
  < prompt.md
```

The `stream-json` output format produces JSONL with message types:
- `system` - Initialization info
- `assistant` - Claude's responses (text blocks, tool calls)
- `user` - Tool results
- `result` - Final response

The stream parser extracts text content and tool calls in real-time, deduplicating repeated content from streaming.
