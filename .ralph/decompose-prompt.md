# PRD Decomposition Task

You are a senior technical architect breaking down a Product Requirements Document (PRD) into small, atomic user stories suitable for the Ralph iterative development technique.

## CRITICAL INSTRUCTIONS

Tools policy for this task:
- DO NOT use any tools (no Bash, Read, Grep, Task, etc.).
  The wrapper script will handle peer review automatically after you output JSON.

Workflow:
1) Decompose the PRD and produce a complete tasks JSON (see Output Format).
2) Output ONLY the JSON. The shell will save the draft and run peer review automatically, then produce a final JSON file.

## Your Task

Analyze the PRD provided below and decompose it into small, independent user stories that can each be completed in a single AI coding iteration.

### Peer Review
- The shell will run peer review automatically after you output JSON. Do not call any tools yourself.

- Capture the codex stdout and extract the first valid JSON object. If `updatedTasks` exists and is valid, minimally merge changes (keep IDs/dependencies stable).

## Output Format

Output ONLY valid JSON in this exact format:

```json
{
  "projectName": "Project name from PRD",
  "branchName": "BRANCH_NAME_HERE",
  "language": "dotnet|python|nodejs|go",
  "standardsFile": ".ralph/standards/{language}.md",
  "description": "Brief description of the overall feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "Short descriptive title",
      "description": "What this story accomplishes",
      "acceptanceCriteria": [
        "Specific, testable criterion from the PRD",
        "All relevant tests pass",
        "Build succeeds with no warnings (if applicable)"
      ],
      "testCases": [
        "MethodName_Scenario_ExpectedResult - Description of what to test",
        "MethodName_EdgeCase_ExpectedBehavior - Edge case coverage"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "dependencies": []
    }
  ]
}
```

**Important:** Set `language` based on the project type in the PRD:
- `.NET / C#` → `"language": "dotnet"`
- `Python` → `"language": "python"`
- `Node.js / TypeScript` → `"language": "nodejs"`
- `Go` → `"language": "go"`

The executing agent will read `.ralph/standards/{language}.md` for detailed coding standards.

---

## MANDATORY ACCEPTANCE CRITERIA

Every story MUST include:

### Build & Test
- All relevant tests pass (scoped to the project being modified)
- Build succeeds with no warnings (for compiled languages)
- No placeholder implementations (NotImplementedException, raise NotImplementedError, etc.)

### Code Quality
- No TODO or FIXME comments left in code
- No commented-out code committed
- No magic strings or numbers - use constants
- Code follows existing project patterns and conventions

---

## TEST CASE REQUIREMENTS

Every story MUST include a `testCases` array specifying the exact tests to write. Tests are scoped to the story - only test what this story implements.

### Test Case Format
Use the naming convention: `MethodName_Scenario_ExpectedResult`

### What to Include
- **Happy path**: Normal successful operation
- **Edge cases**: Empty inputs, null values, boundary conditions
- **Error cases**: Invalid inputs, not found scenarios, validation failures
- **State transitions**: For domain entities with state machines

### Test Case Examples by Story Type

**Domain Entity Story:**
```json
"testCases": [
  "Create_WithValidProperties_ShouldReturnEntity",
  "Create_WithNullRequiredField_ShouldThrow",
  "UpdateStatus_FromQueuedToRunning_ShouldTransition",
  "UpdateStatus_FromCompletedToRunning_ShouldThrowInvalidOperation",
  "Equals_WithSameId_ShouldReturnTrue"
]
```

**Service Method Story:**
```json
"testCases": [
  "GetByIdAsync_WithExistingId_ShouldReturnEntity",
  "GetByIdAsync_WithNonExistentId_ShouldThrowNotFoundException",
  "CreateAsync_WithValidRequest_ShouldPersistAndReturn",
  "CreateAsync_WithDuplicateKey_ShouldThrowConflict",
  "UpdateAsync_WithStaleRowVersion_ShouldThrowConcurrencyException"
]
```

**API Endpoint Story:**
```json
"testCases": [
  "POST_WithValidRequest_ShouldReturn201Created",
  "POST_WithInvalidRequest_ShouldReturn400BadRequest",
  "GET_WithExistingId_ShouldReturn200WithDto",
  "GET_WithNonExistentId_ShouldReturn404NotFound",
  "PUT_WithStaleETag_ShouldReturn409Conflict"
]
```

**Value Object Story:**
```json
"testCases": [
  "Create_WithValidProperties_ShouldReturnValueObject",
  "Equals_WithIdenticalValues_ShouldReturnTrue",
  "Equals_WithDifferentValues_ShouldReturnFalse",
  "GetHashCode_ForEqualObjects_ShouldBeSame"
]
```

### Stories That Don't Need Tests
Some stories may have `"testCases": []` when:
- Adding EF migrations (tested via integration tests)
- Configuration/wiring only (no logic to test)
- Prompt/documentation updates

Mark these explicitly: `"testCases": []` with a note explaining why

---

## STRICT RULES - ALL LANGUAGES

### 1. NEVER Modify Existing Tests
- **NEVER** alter existing test files unless the test is failing due to YOUR changes
- **NEVER** delete or skip tests to make builds pass
- **NEVER** change test assertions to match buggy behavior
- If existing tests fail, **FIX THE IMPLEMENTATION**, not the tests

### 2. No Shortcuts - Zero Tolerance
- **NEVER** use TODO placeholders
- **NEVER** leave empty catch/except blocks
- **NEVER** skip validation "for now"
- **NEVER** hardcode values that should be configurable
- **NEVER** copy-paste code - extract common logic

---

## Rules for Decomposition

### Story Size
- Each story must be completable in ONE coding session
- Maximum 3 files changed per story (excluding tests)
- If a story feels too big, split it further

### Cleanup Responsibilities
When a story introduces temporary/stub code to unblock progress, the dependent story MUST clean it up:

- If Story A adds a stub method that Story B implements properly → Story B's acceptance criteria must include "Remove stub implementation from Story A"
- If Story A adds temporary workaround code → the story that provides the real solution must include cleanup
- **Always explicitly state cleanup in acceptance criteria** - don't assume the agent will notice

**Example:**
```json
{
  "id": "US-005",
  "title": "Implement UserRepository with real database",
  "acceptanceCriteria": [
    "UserRepository connects to PostgreSQL",
    "All CRUD operations implemented",
    "Remove in-memory stub from US-002",
    "Remove TODO comments related to database implementation"
  ],
  "dependencies": ["US-002"]
}
```

### Story Ordering
1. **Foundation (priority 1-10)**: Core types, interfaces, exceptions
2. **Infrastructure (priority 11-20)**: Data access, external integrations
3. **Application (priority 21-40)**: Business logic, services
4. **API/UI (priority 41-60)**: Handlers, endpoints, components
5. **Testing (priority 61-80)**: Unit tests, integration tests
6. **Polish (priority 81+)**: Edge cases, additional validation

### Good vs Bad Stories

**Too Big (Bad):**
- "Implement user management"
- "Build the API layer"

**Right Size (Good):**
- "Create User entity with validation"
- "Add IUserRepository interface"
- "Implement UserRepository"
- "Add CreateUserHandler endpoint"
- "Add unit tests for User entity"

---

## Important

- Output ONLY the JSON, no explanations before or after
- Ensure valid JSON syntax
- Include ALL mandatory acceptance criteria in every story
- **Include specific `testCases` for every story** - tests are mandatory
- Set `language` and `standardsFile` based on the project type
- Set all `passes` to `false`
- Use the branch name provided below
- Never compromise on code quality for speed
- Do not use any tools in this step. The wrapper will peer review your JSON and save draft/final copies.
