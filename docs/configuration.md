# Configuration

## Overview

Qala uses a two-level configuration system:
1. **Global** - Settings that apply across all projects (`~/.qala/`)
2. **Project** - Settings specific to each project (`.ralph/`)

## Global Configuration

Located at `~/.qala/`

### `projects.json` - Project Registry

Tracks all initialized projects:

```json
{
  "version": 1,
  "projects": {
    "/path/to/project": {
      "name": "My Project",
      "path": "/path/to/project",
      "status": "idle",
      "lastActivity": "2024-01-08T10:30:00.000Z",
      "pid": null
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Project display name |
| `path` | string | Absolute path to project |
| `status` | string | idle, running, decomposing, error |
| `lastActivity` | string | ISO timestamp of last activity |
| `pid` | number? | Process ID when running |

### `config.json` - Global Settings

```json
{
  "defaultLanguage": "nodejs",
  "dashboardPort": 3005
}
```

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `defaultLanguage` | string | Default language for new projects | nodejs |
| `dashboardPort` | number | Default dashboard port | 3005 |

## Project Configuration

Located at `.ralph/` within each project.

### `config.json` - Project Settings

```json
{
  "name": "My Project",
  "path": "/path/to/project",
  "branchName": "ralph/feature",
  "language": "nodejs",
  "createdAt": "2024-01-08T00:00:00.000Z",
  "lastRunAt": "2024-01-08T12:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Project name |
| `path` | string | Project path |
| `branchName` | string | Default git branch |
| `language` | string | Primary language |
| `createdAt` | string | When initialized |
| `lastRunAt` | string? | Last Ralph execution |

### `prd.json` - Active Tasks

The current task list for execution. See [PRD Format](#prd-format) below.

### `decompose_state.json` - Decomposition Status

```json
{
  "status": "COMPLETED",
  "message": "Decomposition complete",
  "prdFile": "/path/to/specs/feature.md",
  "draftFile": "/path/to/.ralph/tasks/feature.json",
  "verdict": "PASS",
  "reviewLogs": [
    {"attempt": 1, "path": "peer_review_attempt_1_2024-01-08.log"}
  ],
  "attempts": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | IDLE, DECOMPOSING, REVIEWING, COMPLETED, ERROR |
| `message` | string | Human-readable status |
| `prdFile` | string? | Source PRD path |
| `draftFile` | string? | Generated task file path |
| `verdict` | string? | PASS, FAIL, UNKNOWN, SKIPPED |
| `reviewLogs` | array? | Peer review log references |
| `attempts` | number? | Review attempts made |
| `error` | string? | Error message if failed |

### `.ralph-status.json` - Execution Status

```json
{
  "status": "running",
  "currentIteration": 5,
  "maxIterations": 25,
  "currentStory": "US-003",
  "startedAt": "2024-01-08T10:00:00.000Z",
  "lastUpdateAt": "2024-01-08T10:15:00.000Z",
  "pid": 12345
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | idle, running, paused, completed, error |
| `currentIteration` | number | Current iteration number |
| `maxIterations` | number | Maximum iterations allowed |
| `currentStory` | string? | Story being executed |
| `startedAt` | string? | When execution started |
| `lastUpdateAt` | string? | Last status update |
| `pid` | number? | Process ID |
| `error` | string? | Error message if failed |

### `decompose_feedback.json` - Peer Review Results

```json
{
  "verdict": "PASS",
  "missingRequirements": [],
  "contradictions": [],
  "dependencyErrors": [],
  "duplicates": [],
  "suggestions": [],
  "reviewLog": "/path/to/logs/peer_review.log"
}
```

### `peer_feedback.json` - Inter-iteration Feedback & Knowledge Base

Managed by the Ralph agent across iterations. Contains blocking issues, task-specific suggestions, and accumulated lessons learned:

```json
{
  "blocking": [
    { "issue": "Database connection pool exhausted under load", "addedBy": "US-005", "addedAt": "2024-01-15T10:30:00Z" }
  ],
  "suggestions": [
    { "suggestion": "Use the caching pattern from US-003", "forTask": "US-007", "addedBy": "US-005", "addedAt": "2024-01-15T10:30:00Z" }
  ],
  "lessonsLearned": [
    { "lesson": "Always dispose HttpClient via IHttpClientFactory", "category": "patterns", "addedBy": "US-003", "addedAt": "2024-01-14T09:00:00Z" },
    { "lesson": "EF Core requires explicit Include() for navigation properties", "category": "database", "addedBy": "US-004", "addedAt": "2024-01-14T14:00:00Z" }
  ]
}
```

**Fields:**
- `blocking` - Issues that must be addressed before the next task (cleaned up when resolved)
- `suggestions` - Recommendations for specific tasks (cleaned up when that task completes)
- `lessonsLearned` - Persistent knowledge base (never deleted, accumulates across all iterations)

**Categories for lessonsLearned:** `architecture`, `testing`, `api`, `database`, `performance`, `security`, `tooling`, `patterns`, `gotchas`

### `progress.txt` - Execution History

Managed by Claude during execution. Contains:
- Codebase patterns (top section)
- Story completion summaries (appended)

## PRD Format

### Full Structure

```json
{
  "projectName": "Feature Name",
  "branchName": "ralph/feature",
  "language": "nodejs",
  "standardsFile": ".ralph/standards/nodejs.md",
  "description": "Feature description",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "What this accomplishes",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ],
      "testCases": [
        "Test_Scenario_Expected"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "dependencies": [],
      "executedAt": null,
      "inPrd": false
    }
  ]
}
```

### Story Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (US-001 format) |
| `title` | string | Yes | Short title |
| `description` | string | Yes | What the story does |
| `acceptanceCriteria` | string[] | Yes | Testable criteria |
| `testCases` | string[] | Yes | Test names to implement |
| `priority` | number | Yes | Execution order (lower first) |
| `passes` | boolean | Yes | Completion status |
| `notes` | string | Yes | Additional notes |
| `dependencies` | string[] | Yes | Required story IDs |
| `executedAt` | string? | No | When added to execution |
| `inPrd` | boolean? | No | Whether in active prd.json |

## Language Standards

Located in `.ralph/standards/`:

### `dotnet.md`

C#/.NET coding standards including:
- File-scoped namespaces
- Nullable reference types
- xUnit testing patterns
- Build/test commands

### `python.md`

Python coding standards including:
- Type hints
- pytest patterns
- Black formatting
- Virtual environment setup

### `nodejs.md`

Node.js/TypeScript standards including:
- Strict TypeScript
- ESM modules
- Jest testing
- npm scripts

### `go.md`

Go coding standards including:
- Error handling patterns
- Testing conventions
- go fmt requirements

## Prompt Template

Located at `.ralph/prompt.md`:

Key sections:
1. Task overview
2. State file locations
3. Branch management
4. Story selection logic
5. Standards loading
6. Implementation rules
7. Test requirements
8. Verification steps
9. Commit formatting
10. Progress tracking
11. Stop conditions

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QALA_HOME` | Global config directory | `~/.qala` |
| `RALPH_AUTO_REVIEW` | Enable peer review | `1` |
| `RALPH_MAX_REVIEW_ATTEMPTS` | Max review retries | `3` |

## File Locations Summary

```
~/.qala/
├── config.json              # Global settings
└── projects.json            # Project registry

.ralph/
├── config.json              # Project settings
├── prd.json                 # Active tasks
├── prompt.md                # Agent instructions
├── progress.txt             # Execution history
├── decompose_state.json     # Decomposition status
├── decompose_feedback.json  # Peer review feedback
├── peer_feedback.json       # Story feedback
├── .ralph-status.json       # Execution status
├── standards/
│   ├── dotnet.md
│   ├── python.md
│   ├── nodejs.md
│   └── go.md
├── tasks/                   # Decomposed task files
│   └── *.json
└── logs/                    # Execution logs
    ├── iteration_*.jsonl
    ├── decompose_*.log
    └── peer_review_*.log
```
