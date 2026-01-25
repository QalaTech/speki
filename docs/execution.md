# Ralph Execution Loop

## Overview

The Ralph loop is an iterative execution process where Claude Code completes user stories one at a time, verifying each before moving to the next.

## How It Works

### Iteration Cycle

Each iteration:

```
┌─────────────────────────────────────────┐
│ 1. Load prd.json                        │
│    - Read current task state            │
│    - Identify completed stories         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 2. Find next story                      │
│    - Filter: passes = false             │
│    - Filter: dependencies satisfied     │
│    - Sort: by priority (ascending)      │
│    - Pick: first matching story         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 3. Generate prompt                      │
│    - Load prompt.md template            │
│    - Inject story details               │
│    - Reference standards file           │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 4. Execute via Claude Code              │
│    - Claude reads state files           │
│    - Implements the story               │
│    - Writes tests                       │
│    - Runs verification                  │
│    - Commits changes                    │
│    - Updates prd.json                   │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 5. Check completion                     │
│    - Look for <promise>COMPLETE</promise>│
│    - If found: all stories done         │
│    - If not: continue to next iteration │
└─────────────────────────────────────────┘
```

### Story Selection Algorithm

```typescript
function findNextStory(stories: UserStory[]): UserStory | null {
  const completedIds = new Set(
    stories.filter(s => s.passes).map(s => s.id)
  );

  const ready = stories
    .filter(s => !s.passes)
    .filter(s => s.dependencies.every(d => completedIds.has(d)))
    .sort((a, b) => a.priority - b.priority);

  return ready[0] || null;
}
```

## The Prompt Template

Located at `.speki/prompt.md`, this instructs Claude on:

1. **Reading state** - prd.json, progress.txt, peer_feedback.json
2. **Branch management** - Check/create correct branch
3. **Story selection** - Find next incomplete story
4. **Standards loading** - Read language-specific rules
5. **Implementation** - Code the solution
6. **Testing** - Write and run all test cases
7. **Verification** - Ensure build and tests pass
8. **Committing** - Create properly formatted commit
9. **State updates** - Mark story complete, update progress

### Key Prompt Rules

- Complete only ONE story per iteration
- NEVER modify existing tests (unless broken by changes)
- NEVER take shortcuts (no TODOs, no empty catches)
- ALWAYS run tests before committing
- ALWAYS follow language standards

## Language Standards

Each language has a standards file:

| Language | File | Key Rules |
|----------|------|-----------|
| .NET/C# | `standards/dotnet.md` | Nullable refs, file-scoped namespaces, xUnit |
| Python | `standards/python.md` | Type hints, pytest, black formatting |
| Node.js | `standards/nodejs.md` | TypeScript strict, ESM, Jest |
| Go | `standards/go.md` | Error handling, testing, go fmt |

Standards include:
- Code style conventions
- Test frameworks and patterns
- Build/run commands
- Common pitfalls to avoid

## Logs and Output

### JSONL Logs

Each iteration produces:
- `.speki/logs/iteration_N.jsonl` - Raw Claude stream output
- `.speki/logs/iteration_N.err` - Stderr output

The JSONL contains:
```json
{"type": "system", "subtype": "init", "model": "...", ...}
{"type": "assistant", "message": {"content": [{"type": "text", "text": "..."}]}}
{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", ...}]}}
{"type": "user", "message": {"content": [{"type": "tool_result", ...}]}}
{"type": "result", "result": {"content": [{"type": "text", "text": "..."}]}}
```

### Progress File

`.speki/progress.txt` is managed BY Claude, not the loop:
- Contains codebase patterns at the top
- Appends summary after each story completion
- Persists learnings across iterations

Format:
```markdown
## Codebase Patterns

- Pattern 1 discovered
- Pattern 2 discovered

---

## 2024-01-08 - US-001: Story Title
- What was implemented
- Files changed: [list]
- Tests implemented:
  - Test1 - PASS
  - Test2 - PASS
- Learnings:
  - Something discovered
- Verification:
  - Build: PASS
  - Tests: PASS

---

## 2024-01-08 - US-002: Next Story
...
```

## Completion Detection

Claude signals completion with:
```
<promise>COMPLETE</promise>
```

This is output when ALL stories in prd.json have `passes: true`.

## Error Handling

### Story Fails to Complete

If Claude can't complete a story:
- Tests fail → Claude should fix implementation
- Build fails → Claude should fix errors
- Stuck → Claude documents blocker in notes

### Iteration Errors

If the loop encounters errors:
- Status set to "error"
- Error logged to console
- Can restart with `qala start`

### Abort/Stop

When you run `qala stop`:
- Current Claude process completes its work
- No new iterations start
- Status set to "idle"

## Running from CLI vs Dashboard

### CLI Execution

```bash
qala start --iterations 25
```

- Runs in foreground
- Output visible in terminal
- Ctrl+C to stop

### Dashboard Execution

- Click "Start Ralph" button
- Runs in background
- Progress visible in real-time
- "Stop Ralph" button to abort

## Best Practices

### Before Starting

1. Review the prd.json tasks
2. Ensure branch exists or will be created
3. Check that project builds
4. Commit any uncommitted changes

### During Execution

1. Monitor progress in dashboard or logs
2. Don't modify files Claude is working on
3. Let iterations complete naturally

### After Completion

1. Review the commits made
2. Check test coverage
3. Run full test suite
4. Code review the changes
5. Merge the feature branch

## Troubleshooting

### "No stories ready"

All incomplete stories have unmet dependencies. Check:
- Are dependency IDs correct?
- Is there a circular dependency?
- Did a required story fail?

### Tests keep failing

Claude can't pass the tests. Options:
- Check if tests are correct
- Review the implementation
- Manually fix and mark story complete

### Stuck in loop

Same story attempted repeatedly. Check:
- Is `passes` being set correctly?
- Are tests actually passing?
- View iteration logs for details

### Claude not responding

CLI hangs without output. Check:
- Network connectivity
- Claude CLI is installed and working
- API key is valid
