# PRD Decomposition

## Overview

Decomposition is the process of breaking down a large Product Requirements Document (PRD) into small, atomic user stories that can each be completed in a single AI coding iteration.

## Why Decompose?

Large features are difficult to implement in one shot because:
- Too many moving parts to track
- Higher chance of errors accumulating
- Harder to verify correctness
- No incremental progress visibility

By decomposing into small stories:
- Each story is completable in ~5-15 minutes
- Tests verify each increment
- Progress is visible and measurable
- Failures are isolated and recoverable

## The Decomposition Process

### 1. PRD Input

Place your PRD in a standard location:
- `specs/` - Recommended
- `docs/`
- `prd/`
- `.ralph/specs/`
- Or root directory (must contain "prd", "spec", or "requirement" in filename)

PRD should be a markdown file describing:
- Feature overview
- Requirements (functional and non-functional)
- Acceptance criteria
- Any technical constraints

### 2. Claude Decomposition

When you run `qala decompose`, Claude:

1. **Analyzes the PRD** - Identifies distinct pieces of functionality
2. **Creates atomic stories** - Each story should:
   - Be completable in one coding session
   - Change at most 3 files (excluding tests)
   - Have clear, testable acceptance criteria
   - Include specific test cases
3. **Establishes dependencies** - Stories that must be completed first
4. **Assigns priorities** - Lower number = higher priority

### 3. Peer Review (Codex)

After decomposition, Codex reviews the tasks:

**Checks performed:**
- All PRD requirements have corresponding tasks
- No contradictions between tasks and PRD
- Dependencies reference valid task IDs
- No significant duplicate tasks

**Verdicts:**
- `PASS` - Tasks are ready for execution
- `FAIL` - Issues found, revision needed
- `UNKNOWN` - Review inconclusive

### 4. Revision Loop

If review fails:
1. Feedback is sent back to Claude
2. Claude revises the tasks
3. Review runs again
4. Up to 3 attempts (configurable)

## Output Format

### Task File Structure

```json
{
  "projectName": "Feature Name",
  "branchName": "ralph/feature-branch",
  "language": "nodejs",
  "standardsFile": ".ralph/standards/nodejs.md",
  "description": "Brief description of the overall feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "Short descriptive title",
      "description": "What this story accomplishes",
      "acceptanceCriteria": [
        "Specific, testable criterion",
        "Another criterion",
        "All relevant tests pass",
        "Build succeeds"
      ],
      "testCases": [
        "MethodName_Scenario_ExpectedResult - Description"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "dependencies": []
    },
    {
      "id": "US-002",
      "title": "Second story",
      "description": "Depends on US-001",
      "acceptanceCriteria": ["..."],
      "testCases": ["..."],
      "priority": 2,
      "passes": false,
      "notes": "",
      "dependencies": ["US-001"]
    }
  ]
}
```

### Story Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (US-001, US-002, etc.) |
| `title` | string | Short descriptive title |
| `description` | string | What the story accomplishes |
| `acceptanceCriteria` | string[] | Testable criteria for completion |
| `testCases` | string[] | Specific tests to implement |
| `priority` | number | Execution order (lower = first) |
| `passes` | boolean | Whether story is complete |
| `notes` | string | Additional context or learnings |
| `dependencies` | string[] | IDs of stories that must complete first |

## Best Practices

### Writing Good PRDs

1. **Be specific** - Vague requirements lead to vague tasks
2. **Include examples** - Show expected inputs/outputs
3. **Define boundaries** - What's in scope vs out of scope
4. **List constraints** - Technical limitations, performance requirements
5. **Prioritize** - Indicate which parts are most important

### Reviewing Decomposed Tasks

Before activating:
1. Check that all requirements are covered
2. Verify test cases are specific and meaningful
3. Ensure dependencies make sense
4. Look for tasks that are too large (should be split)
5. Look for tasks that are too small (should be merged)

### Handling Large PRDs

For very large features:
1. Consider splitting into multiple PRDs
2. Use `--fresh` flag to start new numbering
3. Decompose incrementally, activating subsets

## Web Dashboard Decomposition

The dashboard provides a visual interface:

1. **Select PRD** - Choose from detected files or enter path
2. **Configure** - Set branch name and language
3. **Start** - Click "Start Decomposition"
4. **Monitor** - Watch Claude's progress in real-time
5. **Review** - See peer review results
6. **Edit** - Modify tasks if needed
7. **Activate** - Click "Activate & Run" to start execution

### Task Actions

From the dashboard you can:
- View task details
- Delete individual tasks
- Execute a single task independently
- Activate all tasks for sequential execution

## Troubleshooting

### "Could not extract JSON"

Claude's output didn't contain valid JSON. Check:
- PRD is clear and well-structured
- Not too large (try splitting)
- View log file for Claude's actual output

### "Review FAIL" repeatedly

Tasks don't match PRD requirements. Check:
- PRD requirements are unambiguous
- No conflicting requirements
- Review feedback for specific issues

### Decomposition is slow

Large PRDs take longer. Options:
- Split into smaller PRDs
- Accept that complex features need time
- Check Claude CLI is responding (network issues?)

### Tasks are too large

If Claude creates tasks that are too big:
- Add guidance in PRD about desired granularity
- Manually split tasks after decomposition
- Use more specific requirements
