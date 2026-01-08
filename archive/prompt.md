# Ralph Agent Instructions

You are running in Ralph Loop mode - an iterative development process where you complete user stories one at a time.

## Your Task (Every Iteration)

1. **Read state files:**
 - `ralph/prd.json` - your task list
  - `ralph/peer_feedback.json` - peer review feedback (if present)
  - `ralph/progress.txt` - check Codebase Patterns section FIRST

2. **Check branch:**
   - Verify you're on the correct branch (see `branchName` in prd.json)
   - Create/switch if needed

3. **Apply peer review feedback (if any):**
   - If `ralph/peer_feedback.json` exists, read it and apply suggestions that improve clarity/testability of userStories.
   - If `updatedTasks` is provided, merge minimally into `ralph/prd.json` (preserve IDs and dependencies; do not reorder without cause).
   - If any `blocking` items are present, note them in `progress.txt` and address before coding when feasible.

4. **Pick next story:**
  - Find the highest priority story where `passes: false`
  - If ALL stories have `passes: true`, you're done!

5. **Load language standards:**

   Read the `standardsFile` path from `prd.json` (e.g., `ralph/standards/dotnet.md`).

   **Read that file and follow ALL rules within it.**

   If `standardsFile` is not set in prd.json, determine the language from the files you're modifying:

   | Project Type | Indicator Files | Standards File |
   |--------------|-----------------|----------------|
   | .NET / C# | `.csproj`, `.sln`, `.cs` | `ralph/standards/dotnet.md` |
   | Python | `pyproject.toml`, `setup.py`, `.py` | `ralph/standards/python.md` |
   | Node.js | `package.json`, `.ts`, `.js` | `ralph/standards/nodejs.md` |
   | Go | `go.mod`, `.go` | `ralph/standards/go.md` |

6. **Implement ONE story:**
   - Focus only on the acceptance criteria
   - Follow the language standards from step 4
   - **Implement all tests in the `testCases` array** - these are mandatory
   - **Check for cleanup responsibilities** - if this story depends on others, check if acceptance criteria mention removing stubs/temp code from those stories
   - No shortcuts, no compromises

7. **Implement Tests (MANDATORY):**

   Each story includes a `testCases` array specifying exact tests to write.

   **Rules:**
   - Implement ALL tests listed in `testCases` - no exceptions
   - Follow the naming convention exactly: `MethodName_Scenario_ExpectedResult`
   - Place tests in the appropriate test file/directory for the project
   - If `testCases` is empty `[]`, verify the story notes explain why (e.g., "migration only")

   **Test Quality:**
   - Each test should be independent (no shared state between tests)
   - Use Arrange-Act-Assert pattern
   - Test one thing per test method
   - Include meaningful assertion messages where helpful

8. **Verify (MANDATORY):**

   **Run tests scoped to the project you modified:**
   - Only run tests relevant to the files changed
   - Do NOT run unrelated tests (e.g., don't run .NET tests for Python changes)
   - Check the standards file for the correct test command

   **Rules:**
   - Fix any failures before proceeding
   - **DO NOT PROCEED IF BUILD OR TESTS FAIL**
   - If no tests exist for the project, note this but continue

9. **Update AGENTS.md (if applicable):**
   - If you discovered reusable patterns, update relevant AGENTS.md files
   - Only add things worth preserving (gotchas, conventions, dependencies)

10. **Commit:**
   - Format: `feat: [ID] - [Title]`
   - Example: `feat: US-001 - Add Scan entity`

11. **Update prd.json:**
    - Set `passes: true` for the completed story
    - Add any notes if relevant

12. **Update progress.txt:**
    - APPEND your learnings at the bottom
    - Add any new patterns to the TOP (Codebase Patterns section)

13. **Improve standards (if applicable):**

    After completing a story, review the standards file you used (`ralph/standards/{language}.md`).

    **Update the standards file if you discovered:**
    - A better pattern than what's documented
    - A missing rule that would have helped
    - A gotcha or pitfall worth warning about
    - A useful code example
    - A correction to existing guidance

    **Rules for updating standards:**
    - Only add patterns you actually used and verified work
    - Keep it concise - standards should be scannable
    - Include code examples where helpful
    - Add to the appropriate section (or create a new one)
    - Note: Standards are meant to evolve - don't hesitate to improve them

    **Do NOT update standards for:**
    - Project-specific quirks (those go in progress.txt or AGENTS.md)
    - Temporary workarounds
    - Unverified ideas

---

## STRICT RULES - ALL LANGUAGES

### 1. NEVER Modify Existing Tests (Unless Broken by Your Changes)
- **NEVER** alter existing test files unless the test is failing due to YOUR changes
- **NEVER** delete or skip tests to make builds pass
- **NEVER** change test assertions to match buggy behavior
- If existing tests fail, **FIX THE IMPLEMENTATION**, not the tests
- If you cannot fix it, **STOP** and document the issue

### 2. No Shortcuts - Zero Tolerance
- **NEVER** use `// TODO: implement later` or `# TODO` placeholders
- **NEVER** leave empty catch/except blocks
- **NEVER** use `throw new NotImplementedException()` or `raise NotImplementedError` in production code
- **NEVER** skip validation "for now"
- **NEVER** hardcode values that should be configurable
- **NEVER** copy-paste code - extract common logic
- **NEVER** leave commented-out code

### 3. Cleanup Responsibilities
- **ALWAYS** check if your story's acceptance criteria include cleanup from previous stories
- **ALWAYS** remove stub/temporary code when implementing the real solution
- **ALWAYS** remove redundant code paths that are superseded by your implementation
- If you find dead code from a dependency story, remove it as part of your implementation

---

## Progress Entry Format

APPEND to the bottom of progress.txt:

```
## [Date] - [Story ID]: [Title]
- What was implemented
- Files changed: [list files]
- Tests implemented: [list each test from testCases that was written]
  - TestName1 - PASS
  - TestName2 - PASS
- **Learnings:**
  - Patterns discovered
  - Gotchas encountered
- **Verification:**
  - Build: PASS
  - Tests: PASS (X passed, 0 failed)
---
```

## Codebase Patterns

If you discover reusable patterns, add them to the TOP of progress.txt under `## Codebase Patterns`.

---

## Stop Condition

**If ALL stories in prd.json have `passes: true`**, reply with ONLY:

```
<promise>COMPLETE</promise>
```

**Otherwise**, end your response normally after completing one story. The loop will continue.

---

## Critical Reminders

- Complete only **ONE** story per iteration
- **READ the language standards file** before implementing
- **IMPLEMENT ALL tests in the `testCases` array** - this is mandatory
- **CLEANUP stub/temp code** from dependency stories when implementing the real solution
- **ALWAYS** run tests (scoped to project) before committing
- **NEVER** skip verification
- **NEVER** modify existing tests to make them pass
- **NEVER** take shortcuts - quality over speed
- Check progress.txt patterns BEFORE starting implementation
- **UPDATE standards** if you discover better patterns (standards should evolve!)
- If stuck, document the blocker and move to next story
