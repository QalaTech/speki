# Suggested Commands for Qala-Ralph Development

## Build Commands

```bash
# Full build (CLI + Web)
npm run build

# Build CLI only
npm run build:cli

# Build web dashboard only
npm run build:web

# Watch mode for CLI development
npm run dev
```

## Testing Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test src/core/__tests__/settings.test.ts
```

## Type Checking

```bash
# Type check without emitting
npm run typecheck
```

## Linting

```bash
# Run ESLint
npm run lint
```

## Running the Application

```bash
# Run compiled CLI
npm start

# Or directly
node dist/bin/qala.js

# CLI commands (after npm link)
qala init                    # Initialize .ralph/ in current directory
qala list                    # List all registered projects
qala status                  # Show current project status
qala decompose <prd>         # Generate tasks from PRD
qala activate <draft>        # Activate draft as active PRD
qala start                   # Run Ralph loop
qala stop                    # Stop Ralph
qala dashboard               # Launch multi-project web dashboard
```

## Development Setup

```bash
# Install dependencies (also installs web deps via postinstall)
npm install

# Link for global qala command
npm link
```

## Web Dashboard Development

```bash
# Navigate to web directory
cd web

# Run development server
npm run dev

# Build for production
npm run build
```

## Useful Git Commands

```bash
# Check status
git status

# View recent commits
git log --oneline -10

# Create feature branch
git checkout -b feature/my-feature
```

## System Commands (Darwin/macOS)

```bash
# List directory contents
ls -la

# Find files
find . -name "*.ts" -type f

# Search in files
grep -r "pattern" src/

# View file contents
cat filename
head -n 50 filename
tail -n 50 filename
```
