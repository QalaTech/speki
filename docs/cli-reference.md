# CLI Reference

## Global Options

All commands support:
- `--help, -h` - Show help for the command

## Commands

### `qala init`

Initialize a new project in the current directory.

```bash
qala init [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--name, -n <name>` | Project name | Directory name |
| `--language, -l <lang>` | Language type (dotnet, python, nodejs, go) | nodejs |
| `--branch, -b <branch>` | Default branch name | ralph/feature |

**Example:**
```bash
cd my-project
qala init --name "My App" --language dotnet --branch ralph/auth-feature
```

**What it creates:**
```
.speki/
├── config.json          # Project configuration
├── prompt.md            # Ralph agent instructions
├── standards/
│   ├── dotnet.md
│   ├── python.md
│   ├── nodejs.md
│   └── go.md
├── tasks/               # For decomposed task files
└── logs/                # For execution logs
```

---

### `qala decompose`

Decompose a PRD/spec file into atomic user stories.

```bash
qala decompose <prd-file> [options]
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<prd-file>` | Path to the PRD markdown file |

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--branch, -b <branch>` | Branch name for the feature | ralph/feature |
| `--output, -o <name>` | Output filename | `<prd-basename>.json` |
| `--language, -l <lang>` | Language type | (auto-detect) |
| `--fresh, -f` | Start from US-001 (ignore existing numbering) | false |
| `--redecompose, -r` | Force re-decomposition even if draft exists | false |
| `--no-review` | Skip peer review | false |

**Example:**
```bash
# Basic decomposition
qala decompose docs/auth-feature.md

# With options
qala decompose specs/api-refactor.md \
  --branch ralph/api-v2 \
  --language nodejs \
  --output api-tasks.json

# Force fresh start
qala decompose docs/feature.md --fresh --redecompose
```

**Output:**
- Task file saved to `.speki/tasks/<output>.json`
- Peer review feedback in `.speki/decompose_feedback.json`
- Logs in `.speki/logs/decompose_*.log`

---

### `qala start`

Start the Ralph execution loop.

```bash
qala start [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--iterations, -i <n>` | Maximum iterations | 25 |

**Example:**
```bash
# Run up to 25 iterations
qala start

# Run up to 10 iterations
qala start --iterations 10
```

**What it does:**
1. Loads `.speki/prd.json`
2. Finds next incomplete story (highest priority, dependencies met)
3. Executes via Claude Code
4. Verifies tests pass
5. Marks story complete
6. Repeats until all stories pass or max iterations reached

---

### `qala stop`

Stop a running Ralph loop.

```bash
qala stop
```

**Example:**
```bash
qala stop
```

---

### `qala status`

Show the current project status.

```bash
qala status
```

**Output includes:**
- Project name and path
- Ralph status (idle/running/completed)
- Current iteration
- Task progress (completed/ready/blocked)

---

### `qala list`

List all registered projects.

```bash
qala list
```

**Output:**
```
Registered Projects:
────────────────────────────────────────
  My App
    Path: /Users/me/projects/my-app
    Status: idle
    Last Activity: 2024-01-08 10:30:00

  Another Project
    Path: /Users/me/projects/another
    Status: running
    Last Activity: 2024-01-08 11:45:00
────────────────────────────────────────
Total: 2 projects
```

---

### `qala dashboard`

Launch the web dashboard.

```bash
qala dashboard [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <port>` | Server port | 3005 |
| `--host <host>` | Host to bind to | localhost |
| `--no-open` | Don't open browser automatically | false |

**Example:**
```bash
# Default (opens browser at http://localhost:3005)
qala dashboard

# Custom port
qala dashboard -p 8080

# Bind to all interfaces, don't open browser
qala dashboard --host 0.0.0.0 --no-open
```

Opens `http://localhost:3005` (or custom port) in your browser by default.

---

### `qala activate`

Activate a task file as the current PRD.

```bash
qala activate <filename>
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<filename>` | Task file in `.speki/tasks/` |

**Example:**
```bash
# Activate a decomposed task file
qala activate auth-feature.json
```

This copies the task file to `.speki/prd.json` for execution.

---

### `qala unregister`

Remove the current project from the global registry.

```bash
qala unregister
```

**Example:**
```bash
cd my-project
qala unregister
```

This removes the project from `~/.qala/projects.json` but does not delete the `.speki/` folder.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QALA_HOME` | Global config directory | `~/.qala` |
| `RALPH_AUTO_REVIEW` | Enable peer review (0/1) | 1 |
| `RALPH_MAX_REVIEW_ATTEMPTS` | Max review retry attempts | 3 |

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Project not initialized |
| 4 | Claude CLI not found |
