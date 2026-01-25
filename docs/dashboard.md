# Web Dashboard

## Overview

The Qala web dashboard provides a visual interface for managing projects, decomposing PRDs, and monitoring execution.

## Starting the Dashboard

```bash
qala dashboard
# Or with custom port
qala dashboard --port 8080
```

Opens automatically in your default browser at `http://localhost:3005`.

## Interface Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Qala                    ┌──────────────────┐                   │
│                          │ Project Selector │                   │
│  ┌───────────────┐       └──────────────────┘                   │
│  │ Decompose     │                                              │
│  │ Execution     │──────────────────────────────────────────────│
│  │               │                                              │
│  │               │        Main Content Area                     │
│  │               │                                              │
│  │ Auto-refresh  │                                              │
│  │ [x]           │                                              │
│  │ 10:30:45      │                                              │
│  └───────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
     Side Nav                      Content
```

## Navigation

### Side Navigation

- **Project Selector** - Switch between registered projects
- **Decompose** - PRD decomposition interface
- **Execution** - Task management and Ralph control
- **Auto-refresh** - Toggle real-time updates
- **Timestamp** - Last data refresh time

### Execution Tabs

When in Execution view:
- **Board** - Kanban-style task view
- **List** - Detailed task list with filtering
- **Log** - Execution progress and logs

## Decompose View

### PRD Selection

1. **Available Files** - Lists PRD/spec files found in:
   - `specs/`
   - `docs/`
   - `prd/`
   - `.speki/specs/`
   - Root (files containing "prd", "spec", "requirement")

2. **Configuration**
   - **Branch** - Git branch for the feature (default: `ralph/feature`)
   - **Language** - Target language for standards

3. **Actions**
   - **Start** - Begin decomposition
   - **Force Re-decompose** - Ignore existing draft

### Decomposition Progress

Real-time status display:
- **INITIALIZING** - Setting up
- **DECOMPOSING** - Claude generating tasks
- **REVIEWING** - Codex peer review
- **REVISING** - Claude fixing issues
- **COMPLETED** - Ready for execution

### Task Review

After decomposition:
- View all generated tasks
- Click task to see details
- Delete unwanted tasks
- Execute individual tasks
- Activate all tasks

### Task Detail Panel

Slide-out panel showing:
- Task ID and title
- Description
- Acceptance criteria
- Test cases
- Dependencies
- Priority
- Actions (Execute, Delete)

## Execution View

### Stats Header

```
┌─────────────────────────────────────────────────────────────────┐
│  My Project    ralph/feature                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                       │
│  12 Tasks   5 Complete   4 Ready   3 Blocked      [Start Run] │
└─────────────────────────────────────────────────────────────────┘
```

Shows:
- Project name
- Branch name
- Progress bar
- Task counts by status
- Start/Stop button

### Board View (Kanban)

Three columns:
- **Ready** - Tasks with dependencies met
- **In Progress** - Currently executing (highlighted)
- **Complete** - Finished tasks

Plus:
- **Blocked** section for tasks with unmet dependencies
- **Log panel** showing current execution output

### List View

Detailed task table with:
- Status filter (All/Completed/Ready/Blocked)
- Sortable columns
- Task details on click

Task states:
- 🟢 **Completed** - `passes: true`
- 🔵 **Ready** - Dependencies satisfied
- 🔴 **Blocked** - Waiting on dependencies

### Log View

Shows:
- `progress.txt` content (historical)
- Live JSONL stream (when running)
- Tool calls with details
- Errors highlighted

## Real-Time Updates

With auto-refresh enabled:
- **Running**: Updates every 2 seconds
- **Idle**: Updates every 5 seconds

Updates include:
- Ralph status
- Task completion state
- Log content
- Decomposition progress

## Project Switching

Use the dropdown in the side nav to switch projects:
- All registered projects listed
- Current project highlighted
- Switching loads that project's state

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Close detail panel |

## Common Workflows

### Decompose and Run

1. Select project
2. Go to Decompose
3. Select PRD file
4. Set branch and language
5. Click Start
6. Wait for completion
7. Review tasks
8. Click "Activate & Run"
9. Monitor in Execution view

### Run Existing Tasks

1. Select project
2. Go to Execution
3. Click "Start Run"
4. Monitor progress in Board or Log view
5. Click "Stop Run" when needed

### Execute Single Task

1. Go to Decompose
2. Select existing draft
3. Click on a task
4. Click "Execute This Task"
5. Go to Execution to monitor

### Review Progress

1. Go to Execution
2. Switch to Log tab
3. View progress.txt history
4. Or view live JSONL when running

## Troubleshooting

### "No Projects Found"

Run `qala init` in a project directory first.

### "No prd.json found"

Either:
- Decompose a PRD first
- Or activate an existing task file

### Tasks not updating

- Check auto-refresh is enabled
- Manually refresh browser
- Check server is running

### Dashboard won't start

- Check port is available
- Try different port: `qala dashboard --port 3002`
- Check for errors in terminal
