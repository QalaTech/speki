# Qala - Multi-Tenant Ralph CLI

A TypeScript CLI tool for managing Ralph (iterative AI development) across multiple projects.

## Project Structure

```
qala-ralph/
├── src/
│   ├── cli/commands/     # CLI commands (init, start, stop, etc.)
│   ├── core/
│   │   ├── claude/       # Claude CLI integration
│   │   ├── decompose/    # PRD decomposition
│   │   ├── ralph-loop/   # Main Ralph loop
│   │   ├── spec-review/  # Spec review and metadata management
│   │   ├── project.ts    # Per-project .ralph/ management
│   │   └── registry.ts   # Central ~/.qala/ registry
│   ├── server/           # Multi-project dashboard server
│   └── types/            # TypeScript types
├── templates/            # Init templates (prompt.md, standards/)
├── archive/              # Old bash-based ralph (reference)
└── dist/                 # Compiled output
```

## Per-Spec State Directory

Each spec file gets its own state directory under `.ralph/specs/<spec-id>/`:

```
.ralph/
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
- `qala init` - Initialize .ralph/ in current directory
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
npm install
npm run build
npm link  # For global qala command
```

## Migration from Legacy Structure

If upgrading from a version without spec-partitioned state, you need to clean up the legacy files:

```bash
# Remove legacy state files (BREAKING CHANGE)
rm -f .ralph/decompose_state.json
rm -f .ralph/prd.json
rm -rf .ralph/logs/
rm -rf .ralph/sessions/
```

After cleanup, re-run `qala decompose` on your spec files to create the new per-spec state directories.
