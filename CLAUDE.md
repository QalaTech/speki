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
│   │   ├── project.ts    # Per-project .ralph/ management
│   │   └── registry.ts   # Central ~/.qala/ registry
│   ├── server/           # Multi-project dashboard server
│   └── types/            # TypeScript types
├── templates/            # Init templates (prompt.md, standards/)
├── archive/              # Old bash-based ralph (reference)
└── dist/                 # Compiled output
```

## Commands

### Project Management
- `qala init` - Initialize .ralph/ in current directory
- `qala list` - List all registered projects
- `qala status` - Show current project status
- `qala unregister` - Unregister a project from the registry
- `qala update` - Update template files from the latest qala version

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
