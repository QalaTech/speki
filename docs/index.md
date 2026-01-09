# Qala Documentation

## Getting Started

- [README](../README.md) - Quick start guide and overview
- [Getting Started Guide](getting-started.md) - Detailed installation and first project walkthrough

## Reference

- [CLI Reference](cli-reference.md) - All commands and options
- [Configuration](configuration.md) - Config files and environment variables
- [Architecture](architecture.md) - Technical design and data flow

## Features

- [Decomposition](decomposition.md) - Breaking PRDs into atomic tasks
- [Execution](execution.md) - The Ralph loop and story execution
- [Dashboard](dashboard.md) - Web interface guide

## Quick Links

### Common Commands

```bash
# Initialize a project
qala init --name "My Project" --language nodejs

# Decompose a PRD
qala decompose specs/feature.md --branch ralph/feature

# Launch dashboard
qala dashboard

# Start execution
qala start --iterations 25

# Check status
qala status
```

### File Locations

| File | Purpose |
|------|---------|
| `~/.qala/projects.json` | Global project registry |
| `.ralph/config.json` | Project settings |
| `.ralph/prd.json` | Active task list |
| `.ralph/progress.txt` | Execution history |
| `.ralph/tasks/` | Decomposed task files |
| `.ralph/logs/` | Execution logs |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QALA_HOME` | Global config directory | `~/.qala` |
| `RALPH_AUTO_REVIEW` | Enable peer review | `1` |
| `RALPH_MAX_REVIEW_ATTEMPTS` | Max review retries | `3` |
