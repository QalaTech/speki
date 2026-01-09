# Qala

**AI-powered iterative development assistant** - Break down PRDs into small tasks and execute them one at a time using Claude.

Qala's version of Ralph is a multi-tenant CLI tool that helps you:

1. **Decompose** large PRDs into small, atomic user stories
2. **Execute** stories iteratively using Claude Code
3. **Track** progress across multiple projects via a web dashboard

## Quick Start

```bash
# Install globally
npm install -g qala

# Initialize a project
cd your-project
qala init --name "My Project" --language nodejs

# Decompose a PRD into tasks
qala decompose docs/my-feature-prd.md --branch ralph/my-feature

# Start the dashboard
qala dashboard

# Or run from CLI
qala start --iterations 10
```

## Features

- **Multi-project support** - Manage multiple projects from a single dashboard
- **PRD Decomposition** - AI-powered breakdown of requirements into atomic tasks
- **Peer Review** - Automatic review of decomposed tasks using Codex
- **Iterative Execution** - Execute one story at a time with full test verification
- **Progress Tracking** - Real-time status via web dashboard or CLI
- **Language Standards** - Built-in coding standards for .NET, Python, Node.js, and Go

## Architecture

```
~/.qala/                          # Global configuration
├── projects.json                 # Registry of all projects
└── config.json                   # Global settings

/your-project/.ralph/             # Per-project state
├── config.json                   # Project settings
├── prd.json                      # Active task list
├── progress.txt                  # Execution history (managed by Claude)
├── decompose_state.json          # Decomposition status
├── standards/                    # Language-specific coding standards
├── tasks/                        # Decomposed task files
└── logs/                         # Execution logs (JSONL)
```

## CLI Commands

| Command                | Description                                   |
| ---------------------- | --------------------------------------------- |
| `qala init`            | Initialize a project in the current directory |
| `qala decompose <prd>` | Decompose a PRD file into tasks               |
| `qala start`           | Start the Ralph execution loop                |
| `qala stop`            | Stop a running Ralph loop                     |
| `qala status`          | Show current project status                   |
| `qala list`            | List all registered projects                  |
| `qala dashboard`       | Launch the web dashboard                      |
| `qala activate <file>` | Activate a task file as the current PRD       |
| `qala unregister`      | Remove project from registry                  |

## Web Dashboard

The dashboard provides a visual interface for:

- Viewing all registered projects
- Decomposing PRDs with real-time progress
- Reviewing and editing tasks
- Starting/stopping Ralph execution
- Monitoring execution logs in real-time

Start it with:

```bash
qala dashboard
# Opens http://localhost:3005
```

## Workflow

### 1. Decomposition

```bash
qala decompose specs/my-feature.md --branch ralph/feature --language nodejs
```

This will:

1. Send the PRD to Claude for decomposition
2. Generate atomic user stories with acceptance criteria and test cases
3. Run peer review using Codex to validate coverage
4. Save the result to `.ralph/tasks/`

### 2. Activation

```bash
qala activate my-feature.json
```

Or use the dashboard to review tasks and click "Activate & Run".

### 3. Execution

```bash
qala start --iterations 25
```

Ralph will:

1. Find the next incomplete story (highest priority, dependencies satisfied)
2. Generate a prompt with the story details and coding standards
3. Execute via Claude Code
4. Verify tests pass
5. Mark story complete and commit
6. Repeat until all stories pass or max iterations reached

## Configuration

### Project Config (`.ralph/config.json`)

```json
{
  "name": "My Project",
  "path": "/path/to/project",
  "branchName": "ralph/feature",
  "language": "nodejs",
  "createdAt": "2024-01-08T00:00:00.000Z"
}
```

### Language Standards

Each language has a standards file in `.ralph/standards/`:

- `dotnet.md` - C#/.NET conventions
- `python.md` - Python conventions
- `nodejs.md` - Node.js/TypeScript conventions
- `go.md` - Go conventions

These are read by Claude during execution to ensure consistent code style.

## PRD Format

The decomposed PRD (`prd.json`) follows this structure:

```json
{
  "projectName": "My Feature",
  "branchName": "ralph/feature",
  "language": "nodejs",
  "standardsFile": ".ralph/standards/nodejs.md",
  "description": "Feature description",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add user authentication",
      "description": "Implement JWT-based authentication",
      "acceptanceCriteria": [
        "Users can log in with email/password",
        "JWT tokens are issued on successful login",
        "Protected routes require valid token"
      ],
      "testCases": [
        "Login_WithValidCredentials_ReturnsToken",
        "Login_WithInvalidCredentials_Returns401",
        "ProtectedRoute_WithoutToken_Returns401"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "dependencies": []
    }
  ]
}
```

## Development

```bash
# Clone the repo
git clone git@github.com:QalaTech/qala-ralph.git
cd qala-ralph

# Install dependencies
npm install
cd web && npm install && cd ..

# Build
npm run build

# Link for local development
npm link

# Run dashboard in dev mode
npm run dev
```

## Requirements

- Node.js 18+
- Claude Code CLI (`claude` command available)
- Codex CLI (`codex` command) - optional, for peer review

## License

MIT
