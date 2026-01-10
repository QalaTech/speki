# Qala-Ralph Project Overview

## Purpose
Qala is a multi-tenant CLI tool for managing Ralph (iterative AI development) across multiple projects. Ralph is a methodology for using AI agents to iteratively develop software by decomposing PRDs into user stories and executing them one by one.

## Tech Stack

### CLI/Backend (TypeScript)
- **Runtime**: Node.js (>= 18.0.0)
- **Language**: TypeScript
- **CLI Framework**: Commander.js
- **HTTP Server**: Express.js (for dashboard API)
- **Testing**: Vitest
- **Type Checking**: TypeScript compiler

### Web Dashboard (React + TypeScript)
- **Framework**: React 18+ (functional components with hooks)
- **Build Tool**: Vite
- **Language**: TypeScript
- **CSS**: Plain CSS files (no CSS-in-JS)

## Project Structure

```
qala-ralph/
├── src/                    # CLI and backend source
│   ├── cli/commands/       # CLI commands (init, start, stop, decompose, etc.)
│   ├── core/               # Core business logic
│   │   ├── claude/         # Claude CLI integration
│   │   ├── decompose/      # PRD decomposition and peer review
│   │   ├── ralph-loop/     # Main Ralph execution loop
│   │   ├── project.ts      # Per-project .ralph/ management
│   │   ├── registry.ts     # Central ~/.qala/ registry
│   │   ├── settings.ts     # Global settings management
│   │   ├── cli-detect.ts   # CLI detection (claude, codex)
│   │   └── keep-awake.ts   # System keep-awake utility
│   ├── server/             # Express API server
│   │   ├── routes/         # API route handlers
│   │   └── middleware/     # Express middleware
│   └── types/              # TypeScript type definitions
├── web/                    # React dashboard
│   └── src/
│       ├── components/     # React components
│       └── utils/          # Utility functions
├── templates/              # Init templates (prompt.md, standards/)
├── .ralph/                 # Per-project Ralph configuration
│   ├── standards/          # Coding standards (dotnet.md, nodejs.md, etc.)
│   ├── tasks/              # Task files
│   └── logs/               # Execution logs
└── dist/                   # Compiled output
```

## Key Concepts

1. **PRD Decomposition**: Breaking down Product Requirements Documents into small, atomic user stories
2. **Peer Review**: AI-assisted review of decomposed tasks against the original PRD
3. **Ralph Loop**: Iterative execution of user stories one at a time
4. **Project Registry**: Central tracking of all Qala-managed projects (~/.qala/)
5. **Standards**: Per-language coding standards (.ralph/standards/)

## Key Files
- `src/types/index.ts` - All TypeScript interfaces and types
- `src/core/settings.ts` - Global settings management (DEFAULT_SETTINGS, load/save)
- `src/core/decompose/peer-review.ts` - AI peer review logic
- `src/core/ralph-loop/runner.ts` - Main execution loop
- `src/server/index.ts` - Express server entry point
