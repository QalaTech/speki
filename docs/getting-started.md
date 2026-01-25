# Getting Started with Qala

This guide walks you through installing Qala, initializing your first project, and running your first automated task execution.

## Prerequisites

### Required

1. **Node.js 18 or higher**
   ```bash
   # Check your version
   node --version

   # Should output v18.0.0 or higher
   ```

   If you need to install or upgrade Node.js:
   - macOS: `brew install node` or download from [nodejs.org](https://nodejs.org/)
   - Linux: Use your package manager or [nvm](https://github.com/nvm-sh/nvm)
   - Windows: Download from [nodejs.org](https://nodejs.org/)

2. **Claude Code CLI**

   The `claude` command must be available in your terminal. This is Anthropic's official CLI for Claude.

   ```bash
   # Verify installation
   claude --version

   # Test it works
   claude "Say hello"
   ```

   If not installed, follow [Claude Code installation instructions](https://docs.anthropic.com/claude-code).

### Optional

3. **Codex CLI** (for peer review)

   Codex is used to validate that decomposed tasks fully cover the PRD requirements.

   ```bash
   codex --version
   ```

   Without Codex, decomposition still works but skips the peer review step.

4. **Git** (recommended)

   Qala commits changes after each successful task. Having git initialized in your project is recommended.

## Installation

### Step 1: Clone the Repository

```bash
git clone git@github.com:QalaTech/qala-ralph.git
cd qala-ralph
```

Or using HTTPS:
```bash
git clone https://github.com/QalaTech/qala-ralph.git
cd qala-ralph
```

### Step 2: Install Dependencies

```bash
npm install
```

This command:
- Installs CLI dependencies
- Automatically runs `postinstall` to install web dashboard dependencies

### Step 3: Build

```bash
npm run build
```

This compiles:
- TypeScript CLI to `dist/`
- React web dashboard to `web/dist/`

### Step 4: Link Globally

```bash
npm link
```

This creates a global `qala` command that you can run from any directory.

### Step 5: Verify Installation

```bash
qala --help
```

You should see:
```
Usage: qala [options] [command]

Multi-tenant AI-driven task runner powered by Claude

Options:
  -V, --version       output the version number
  -h, --help          display help for command

Commands:
  init [options]      Initialize a new project
  decompose [options] Decompose a PRD into tasks
  start [options]     Start the Ralph execution loop
  stop                Stop the running Ralph loop
  status              Show current project status
  list                List all registered projects
  dashboard [options] Launch the web dashboard
  activate <file>     Activate a task file
  unregister          Remove project from registry
  help [command]      display help for command
```

## Initialize Your First Project

### Step 1: Navigate to Your Project

```bash
cd /path/to/your/existing/project
```

Qala works with existing codebases. You should have:
- An existing project with source code
- Ideally a git repository (for commits)

### Step 2: Run Init

```bash
qala init --name "My Project" --language nodejs
```

**Available options:**

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--name` | `-n` | Project display name | Current directory name |
| `--language` | `-l` | Primary language | `nodejs` |
| `--branch` | `-b` | Default git branch | `ralph/feature` |

**Supported languages:**
- `nodejs` - Node.js/TypeScript (Jest testing)
- `dotnet` - C#/.NET (xUnit testing)
- `python` - Python (pytest testing)
- `go` - Go (go test)

### Step 3: Verify Initialization

```bash
ls -la .speki/
```

You should see:
```
.speki/
├── config.json      # Project configuration
├── prompt.md        # Claude execution instructions
├── standards/       # Language-specific coding standards
│   ├── dotnet.md
│   ├── go.md
│   ├── nodejs.md
│   └── python.md
├── tasks/           # Will contain decomposed task files
└── logs/            # Will contain execution logs
```

Check registration:
```bash
qala list
```

Your project should appear in the list.

## Create Your First PRD

PRD files go in your **project folder** (the folder where you ran `qala init`), not in the qala-ralph installation folder.

### Step 1: Create a Specs Directory

```bash
# Make sure you're in your project folder
cd /path/to/your/project

# Create specs folder
mkdir -p specs
```

### Step 2: Write a Simple PRD

Create `specs/hello-world.md` in your project:

**Your project structure should now look like:**
```
your-project/                    # Your project root
├── src/                         # Your existing source code
├── package.json                 # Your project files
├── specs/                       # NEW: Create this folder
│   └── hello-world.md           # NEW: Your PRD file
└── .speki/                      # Created by qala init
    ├── config.json
    ├── prompt.md
    ├── standards/
    ├── tasks/
    └── logs/
```

**Contents of `specs/hello-world.md`:**

```markdown
# Feature: Hello World Endpoint

## Overview
Add a simple health check endpoint to the API.

## Requirements
1. GET /health returns 200 OK
2. Response includes { "status": "healthy", "timestamp": "<current time>" }
3. Endpoint requires no authentication

## Acceptance Criteria
- Endpoint responds within 100ms
- Returns valid JSON
- Includes ISO 8601 timestamp
```

## Decompose the PRD

### Option A: Using the Dashboard (Recommended)

```bash
qala dashboard
```

1. Your browser opens to `http://localhost:3005`
2. Select your project from the dropdown (if multiple)
3. Click **Decompose** in the sidebar
4. Select `specs/hello-world.md` from the file list
5. Set branch name (e.g., `ralph/health-endpoint`)
6. Click **Start Decomposition**
7. Wait for completion (watch the progress)
8. Review the generated tasks

### Option B: Using CLI

```bash
qala decompose specs/hello-world.md --branch ralph/health-endpoint
```

### What Happens During Decomposition

1. **Claude Analysis** - Claude reads your PRD and breaks it into atomic user stories
2. **Task Generation** - Each story gets:
   - Unique ID (US-001, US-002, etc.)
   - Title and description
   - Acceptance criteria
   - Test case names
   - Priority and dependencies
3. **Peer Review** (if Codex available) - Validates:
   - All requirements are covered
   - No contradictions
   - Dependencies are correct
4. **Output** - Tasks saved to `.speki/tasks/<prd-name>.json`

## Review and Activate Tasks

### In the Dashboard

1. After decomposition completes, tasks appear in the task list
2. Click any task to see details:
   - Description
   - Acceptance criteria
   - Test cases
   - Dependencies
3. Delete unwanted tasks (click trash icon)
4. Click **Activate All** to copy tasks to active PRD
5. Or click **Activate & Run** to start immediately

### Via CLI

```bash
# Activate a task file
qala activate hello-world.json

# Check active tasks
qala status
```

## Execute Tasks

### Start Execution

**Via Dashboard:**
- Click the green **Start Ralph** button

**Via CLI:**
```bash
qala start --iterations 25
```

### What Happens During Execution

For each task, Claude will:

1. **Read State** - Load prd.json, progress.txt, standards
2. **Select Task** - Find next incomplete task with satisfied dependencies
3. **Implement** - Write code following your language standards
4. **Test** - Create and run tests for all test cases
5. **Verify** - Ensure build passes with no warnings
6. **Commit** - Create a git commit with the changes
7. **Update** - Mark task as complete in prd.json
8. **Repeat** - Move to next task

### Monitor Progress

**Dashboard Kanban View:**
- **Blocked** - Tasks waiting on dependencies
- **Ready** - Tasks that can be started
- **In Progress** - Currently executing task
- **Done** - Completed tasks

**Live Chat Logs:**
- Claude's thinking appears on the left
- Tool calls (Read, Write, Bash, etc.) appear on the right
- Errors highlighted in red

### Stop Execution

**Via Dashboard:**
- Click the red **Stop Ralph** button

**Via CLI:**
```bash
qala stop
```

## Review Results

### Check Commits

```bash
git log --oneline -10
```

Each completed task creates a commit like:
```
abc1234 feat: US-003 - Add timestamp to health response
def5678 feat: US-002 - Implement health endpoint handler
ghi9012 feat: US-001 - Create health route
```

### Check Test Coverage

Run your project's test suite:
```bash
npm test        # Node.js
dotnet test     # .NET
pytest          # Python
go test ./...   # Go
```

### View Progress History

```bash
cat .speki/progress.txt
```

Or view in the dashboard's **Progress** tab.

## Next Steps

1. **Try a larger PRD** - Write a more complex feature specification
2. **Customize standards** - Edit `.speki/standards/<lang>.md` for your coding conventions
3. **Multiple projects** - Initialize Qala in other projects and manage from one dashboard
4. **Explore CLI options** - Run `qala <command> --help` for each command

## Common Issues

### "No PRD files found"

Ensure your PRD files are in one of these locations:
- `specs/`
- `docs/`
- `prd/`
- Root directory (files containing "prd", "spec", or "requirement")

### "Dependencies not satisfied"

Check task dependencies in the dashboard. A task can't run until all its dependencies are complete.

### "Build failed"

Claude will attempt to fix build errors. Check the logs for details. You may need to:
- Fix pre-existing build issues
- Update your language standards file

### "Tests failing"

Claude writes tests based on the acceptance criteria. If tests fail:
- Review the test implementation
- Check if acceptance criteria are achievable
- Manually fix and mark task complete if needed

## Getting Help

- **CLI help**: `qala --help` or `qala <command> --help`
- **Documentation**: See other files in `docs/`
- **Issues**: Report at [GitHub Issues](https://github.com/QalaTech/qala-ralph/issues)
