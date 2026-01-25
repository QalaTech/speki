# Qala - Multi-Tenant Ralph CLI

A TypeScript CLI tool for managing Ralph (iterative AI development) across multiple projects.

## Project Structure

This is an npm workspaces monorepo with 4 packages:

```
qala-ralph/
├── packages/
│   ├── core/                    # @speki/core - Business logic & types
│   │   └── src/
│   │       ├── types/           # Shared TypeScript types
│   │       ├── llm/             # LLM engine abstraction
│   │       ├── claude/          # Claude CLI integration
│   │       ├── decompose/       # PRD decomposition
│   │       ├── ralph-loop/      # Main Ralph loop
│   │       ├── spec-review/     # Spec review and metadata management
│   │       ├── tech-spec/       # Tech spec generation
│   │       ├── task-queue/      # Task queue management
│   │       ├── project.ts       # Per-project .speki/ management
│   │       └── registry.ts      # Central ~/.qala/ registry
│   ├── server/                  # @speki/server - Express API
│   │   └── src/
│   │       ├── routes/          # API routes
│   │       └── middleware/      # Express middleware
│   ├── cli/                     # @speki/cli - CLI commands
│   │   ├── src/
│   │   │   ├── commands/        # CLI commands (init, start, stop, etc.)
│   │   │   └── tui/             # Terminal UI
│   │   └── templates/           # Init templates (prompt.md, standards/)
│   └── web/                     # @speki/web - React frontend
│       └── src/
│           ├── components/      # React components
│           ├── features/        # Feature modules
│           └── hooks/           # React hooks
├── docs/
└── specs/
```

### Package Dependencies

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

## Per-Spec State Directory

Each spec file gets its own state directory under `.speki/specs/<spec-id>/`:

```
.speki/
├── specs/
│   ├── my-feature/
│   │   ├── logs/                  # Decompose and review logs
│   │   ├── decompose_state.json   # Task decomposition output
│   │   ├── review_state.json      # Review session state
│   │   └── metadata.json          # Spec status and timestamps
│   └── another-spec/
│       └── ...
├── config.json
├── progress.txt
└── prompt.md
```

The `<spec-id>` is derived from the spec filename (e.g., `my-feature.md` → `my-feature`).

## Spec Lifecycle

Each spec progresses through the following states:

```
draft → reviewed → decomposed → active → completed
         ↓
         └─────→ decomposed
```

| Status | Description |
|--------|-------------|
| `draft` | Initial state after first decompose or review |
| `reviewed` | Spec has passed AI review |
| `decomposed` | Tasks have been generated from the spec |
| `active` | Spec is currently being executed via `qala start` |
| `completed` | All tasks have been completed |

Valid transitions:
- `draft` → `reviewed` or `decomposed`
- `reviewed` → `decomposed`
- `decomposed` → `active`
- `active` → `completed`

## Commands

### Project Management
- `qala init` - Initialize .speki/ in current directory
- `qala list` - List all registered projects
- `qala status` - Show current project status
- `qala unregister` - Unregister a project from the registry
- `qala update` - Update template files from the latest qala version
- `qala update --all` - Update all registered projects globally

### Spec Review
- `qala spec review <file>` - AI-powered spec review with suggestions
- `qala spec list` - List all spec files in the project

### PRD Decomposition
- `qala decompose <prd>` - Generate tasks from PRD
- `qala activate <draft>` - Activate draft as active PRD

### Task Management
- `qala tasks list` - List all tasks with their status
- `qala tasks next` - Show next pending task (by priority, respecting dependencies)

### Execution
- `qala start` - Run Ralph loop
- `qala stop` - Stop Ralph
- `qala dashboard` - Launch multi-project web dashboard

## Development

```bash
npm install                    # Install all workspace dependencies
npm run build                  # Build all packages (core → server → cli → web)
npm run build:cli              # Build only CLI packages (core → server → cli)
./install.sh                   # Install global qala command
```

### Working with Packages

```bash
# Build individual packages
npm run build -w @speki/core
npm run build -w @speki/server
npm run build -w @speki/cli
npm run build -w @speki/web

# Run tests
npm test                       # Run all tests
npm run test -w @speki/core    # Test a specific package

# Development mode
npm run dev                    # Build core, then watch web and CLI
```

## Migration from Legacy Structure

If upgrading from a version without spec-partitioned state, you need to clean up the legacy files:

```bash
# Remove legacy state files (BREAKING CHANGE)
rm -f .speki/decompose_state.json
rm -f .speki/prd.json
rm -rf .speki/logs/
rm -rf .speki/sessions/
```

After cleanup, re-run `qala decompose` on your spec files to create the new per-spec state directories.
