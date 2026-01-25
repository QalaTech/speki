# Qala

**AI-powered iterative development assistant** - Break down PRDs into atomic tasks and execute them one at a time using Claude Code.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [CLI Commands](#cli-commands)
- [Web Dashboard](#web-dashboard)
- [Documentation](#documentation)
- [License](#license)

## Prerequisites

Before installing Qala, ensure you have:

1. **Node.js 18+** - [Download](https://nodejs.org/)
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **Claude Code CLI** - The `claude` command must be available
   ```bash
   claude --version  # Verify Claude Code is installed
   ```

3. **Codex CLI** (optional) - For peer review of decomposed tasks
   ```bash
   codex --version  # Optional - enables task validation
   ```

## Installation

### From Source (Recommended)

```bash
# 1. Clone the repository
git clone git@github.com:QalaTech/qala-ralph.git
cd qala-ralph

# 2. Install dependencies
npm install

# 3. Build all packages (core → server → cli → web)
npm run build

# 4. Install global 'qala' command
./install.sh

# 5. Verify installation
qala --help
```

To uninstall:
```bash
sudo rm /usr/local/bin/qala
```

## Getting Started

### Step 1: Initialize Your Project

Navigate to your project directory and initialize Qala:

```bash
cd /path/to/your/project

# Basic initialization
qala init

# Or with options
qala init --name "My Project" --language nodejs --branch ralph/feature
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Project display name | Directory name |
| `-l, --language <lang>` | Language: `dotnet`, `python`, `nodejs`, `go` | `nodejs` |
| `-b, --branch <branch>` | Default git branch for features | `ralph/feature` |

This creates a `.speki/` folder in your project with:
```
.speki/
├── config.json          # Project configuration
├── prompt.md            # Instructions for Claude
├── standards/           # Language-specific coding standards
│   ├── dotnet.md
│   ├── python.md
│   ├── nodejs.md
│   └── go.md
├── tasks/               # Decomposed task files
└── logs/                # Execution logs
```

### Step 2: Write a PRD

Create a PRD (Product Requirements Document) in markdown format. Place it in your **project folder** (not the qala-ralph folder) in one of these locations:
- `specs/` (recommended)
- `docs/`
- `prd/`

**Example project structure after creating a spec:**
```
my-project/                      # Your project root
├── src/                         # Your source code
├── tests/                       # Your tests
├── package.json                 # Your project config
├── specs/                       # Create this folder for PRDs
│   └── auth-feature.md          # Your PRD file
└── .speki/                      # Created by qala init
    ├── config.json
    ├── prompt.md
    ├── standards/
    ├── tasks/
    └── logs/
```

**Example PRD (`specs/auth-feature.md`):**
```markdown
# Feature: User Authentication

## Overview
Implement JWT-based user authentication for the API.

## Requirements
1. Users can register with email and password
2. Users can login and receive a JWT token
3. Protected endpoints require valid JWT
4. Tokens expire after 24 hours

## Technical Notes
- Use bcrypt for password hashing
- Store refresh tokens in database
```

### Step 3: Decompose the PRD

Convert your PRD into atomic, executable tasks.

**Option A: Using the Dashboard (Recommended)**
```bash
qala dashboard
```
1. Select your project from the dropdown
2. Click **Decompose** in the sidebar
3. Select your spec file from the list (e.g., `specs/auth-feature.md`)
4. Set the branch name and language
5. Click **Start Decomposition**
6. Watch progress in real-time

**Option B: Using CLI**
```bash
qala decompose specs/auth-feature.md --branch ralph/auth
```

The decomposition will:
1. Send your PRD to Claude for analysis
2. Generate atomic user stories with acceptance criteria
3. Create test cases for each story
4. Run peer review to validate coverage
5. Save tasks to `.speki/tasks/`

### Step 4: Review and Activate Tasks

Use the dashboard to review generated tasks:

```bash
qala dashboard
```

In the dashboard:
1. Go to **Decompose** section
2. Review each task's acceptance criteria and test cases
3. Delete any unwanted tasks
4. Click **Activate & Run** to start execution

Or activate via CLI:
```bash
qala activate auth-feature.json
```

### Step 5: Execute Tasks

Start the Ralph execution loop:

```bash
# Via dashboard - click "Start Ralph"

# Or via CLI
qala start --iterations 25
```

Ralph will automatically:
1. Pick the next ready task (by priority, with dependencies met)
2. Implement the code following your language standards
3. Write and run tests
4. Commit changes on success
5. Move to the next task

Monitor progress in the dashboard's **Kanban** view with live chat logs.

## Usage Guide

### Typical Workflow

```bash
# 1. Initialize (once per project)
cd my-project
qala init --name "My App" --language dotnet

# 2. Write your PRD
vim specs/new-feature.md

# 3. Start dashboard
qala dashboard

# 4. In dashboard:
#    - Select your PRD file
#    - Click "Start Decomposition"
#    - Review generated tasks
#    - Click "Activate & Run"
#    - Monitor in Kanban view

# 5. When complete, review commits
git log --oneline
```

### Managing Multiple Projects

Qala supports multiple projects from a single dashboard:

```bash
# Initialize multiple projects
cd ~/project-a && qala init --name "Project A"
cd ~/project-b && qala init --name "Project B"

# List all registered projects
qala list

# Start dashboard (shows all projects)
qala dashboard

# Use dropdown in dashboard to switch projects
```

### Stopping Execution

```bash
# Via dashboard - click "Stop Ralph"

# Or via CLI
qala stop
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `qala init` | Initialize project in current directory |
| `qala decompose <prd>` | Decompose a PRD file into tasks |
| `qala start` | Start the Ralph execution loop |
| `qala stop` | Stop a running Ralph loop |
| `qala status` | Show current project status |
| `qala list` | List all registered projects |
| `qala dashboard` | Launch the web dashboard |
| `qala activate <file>` | Activate a task file |
| `qala unregister` | Remove project from registry |

See [CLI Reference](docs/cli-reference.md) for detailed options.

## Web Dashboard

The dashboard provides a visual interface at `http://localhost:3005`:

```bash
qala dashboard              # Default port 3005
qala dashboard -p 8080      # Custom port
qala dashboard --no-open    # Don't open browser
```

**Features:**
- **Project Selector** - Switch between registered projects
- **Decompose View** - Select PRDs, start decomposition, review tasks
- **Kanban Board** - Visual task status with dependency highlighting
- **Live Chat Logs** - Real-time Claude activity with chat bubbles
- **Progress History** - View completed task summaries

## Documentation

- [Getting Started](docs/getting-started.md) - Detailed setup guide
- [CLI Reference](docs/cli-reference.md) - All commands and options
- [Architecture](docs/architecture.md) - Technical design
- [Decomposition](docs/decomposition.md) - How PRD breakdown works
- [Execution](docs/execution.md) - The Ralph loop explained
- [Dashboard](docs/dashboard.md) - Web interface guide
- [Configuration](docs/configuration.md) - Config files reference

## Project Structure

### Qala Monorepo

```
qala-ralph/
├── packages/
│   ├── core/                     # @speki/core - Shared types & business logic
│   ├── server/                   # @speki/server - Express API
│   ├── cli/                      # @speki/cli - CLI commands
│   └── web/                      # @speki/web - React dashboard
├── docs/                         # Documentation
└── specs/                        # Example specs
```

### Global Config

```
~/.qala/                          # Global (created automatically)
├── projects.json                 # Registry of all projects
└── config.json                   # Global settings
```

### Per-Project Config

```
/your-project/.speki/             # Per-project (created by qala init)
├── config.json                   # Project settings
├── progress.txt                  # Execution history
├── prompt.md                     # Claude instructions
├── standards/                    # Coding standards
├── specs/                        # Per-spec state directories
│   └── <spec-id>/
│       ├── metadata.json         # Spec status and timestamps
│       ├── decompose_state.json  # Task decomposition output
│       ├── review_state.json     # Review session state
│       └── logs/                 # Decompose and review logs
└── tasks/                        # Decomposed task files
```

## Troubleshooting

### "command not found: qala"

Run `npm link` from the qala-ralph directory:
```bash
cd /path/to/qala-ralph
npm link
```

### "No projects found"

Initialize a project first:
```bash
cd your-project
qala init
```

### Dashboard won't start

Check if port is in use:
```bash
qala dashboard -p 3006  # Try different port
```

### Claude not responding

Verify Claude Code is installed and authenticated:
```bash
claude --version
claude "Hello"  # Test it works
```

## License

MIT
