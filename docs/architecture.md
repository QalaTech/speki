# Architecture

## Overview

Qala is a TypeScript monorepo with four packages:

1. **Core** (`packages/core`) - Shared types and business logic
2. **Server** (`packages/server`) - Express API for the web dashboard
3. **CLI** (`packages/cli`) - Command-line interface
4. **Web** (`packages/web`) - React dashboard

## Directory Structure

```
qala-ralph/
├── packages/
│   ├── core/                       # @speki/core - Business logic
│   │   └── src/
│   │       ├── types/              # Shared TypeScript types
│   │       ├── llm/                # LLM engine abstraction
│   │       ├── claude/             # Claude CLI integration
│   │       ├── decompose/          # PRD decomposition
│   │       ├── ralph-loop/         # Main Ralph loop
│   │       ├── spec-review/        # Spec review and metadata
│   │       ├── tech-spec/          # Tech spec generation
│   │       ├── task-queue/         # Task queue management
│   │       ├── project.ts          # Per-project .speki/ management
│   │       └── registry.ts         # Central ~/.qala/ registry
│   │
│   ├── server/                     # @speki/server - Express API
│   │   └── src/
│   │       ├── routes/             # API routes
│   │       │   ├── projects.ts     # /api/projects
│   │       │   ├── tasks.ts        # /api/tasks
│   │       │   ├── decompose.ts    # /api/decompose
│   │       │   ├── ralph.ts        # /api/ralph
│   │       │   └── spec-review.ts  # /api/spec-review
│   │       └── middleware/         # Express middleware
│   │
│   ├── cli/                        # @speki/cli - CLI commands
│   │   ├── src/
│   │   │   ├── commands/           # CLI command implementations
│   │   │   │   ├── init.ts
│   │   │   │   ├── decompose.ts
│   │   │   │   ├── start.ts
│   │   │   │   ├── stop.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── list.ts
│   │   │   │   ├── dashboard.ts
│   │   │   │   ├── activate.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   ├── spec.ts
│   │   │   │   └── unregister.ts
│   │   │   └── tui/                # Terminal UI
│   │   └── templates/              # Init templates
│   │       ├── prompt.md           # Ralph agent instructions
│   │       └── standards/          # Language coding standards
│   │
│   └── web/                        # @speki/web - React dashboard
│       └── src/
│           ├── components/         # React components
│           ├── features/           # Feature modules
│           └── hooks/              # React hooks
│
├── docs/                           # Documentation
└── specs/                          # Example specs
```

## Package Dependencies

```
              ┌─────────────┐
              │  @speki/    │
              │    core     │  (types + business logic)
              └──────┬──────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  @speki/    │ │  @speki/    │ │  @speki/    │
│   server    │ │    cli      │ │    web      │
└──────┬──────┘ └──────┬──────┘ └─────────────┘
       │               │              │
       └───────┬───────┘              │
               │      HTTP API        │
               └──────────────────────┘
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

### Registry (`packages/core/src/registry.ts`)

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

### Project (`packages/core/src/project.ts`)

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

### Claude Runner (`packages/core/src/claude/runner.ts`)

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

### Stream Parser (`packages/core/src/claude/stream-parser.ts`)

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

### Per-Spec State Directory (`.speki/specs/<spec-id>/`)

Each spec file gets its own state directory:

```
.speki/specs/my-feature/
├── metadata.json           # Spec status and timestamps
├── decompose_state.json    # Task decomposition output
├── review_state.json       # Review session state
└── logs/                   # Decompose and review logs
```

### `metadata.json` - Spec Status

```json
{
  "specId": "my-feature",
  "status": "draft|reviewed|decomposed|active|completed",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
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
