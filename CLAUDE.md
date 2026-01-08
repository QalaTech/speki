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

- `qala init` - Initialize .ralph/ in current directory
- `qala list` - List all registered projects
- `qala status` - Show current project status
- `qala decompose <prd>` - Generate tasks from PRD
- `qala activate <draft>` - Activate draft as active PRD
- `qala start` - Run Ralph loop
- `qala stop` - Stop Ralph
- `qala dashboard` - Launch multi-project web dashboard

## Development

```bash
npm install
npm run build
npm link  # For global qala command
```
