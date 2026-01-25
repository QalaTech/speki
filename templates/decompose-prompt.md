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
  "standardsFile": ".speki/standards/{language}.md",
  "description": "Brief description of the overall feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "Short descriptive title",
      "description": "WHAT this story creates/changes + WHY it matters (the benefit or problem it solves). Include technical context that helps the implementer understand the purpose.",
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
      "dependencies": [],
      "complexity": "low|medium|high",
      "context": {
        "suggestions": {
          "schemas": "Optional: Schema suggestions the agent MAY use",
          "examples": "Optional: Code examples for guidance",
          "patterns": "Optional: Suggested architectural patterns"
        },
        "requirements": {
          "apiContracts": "Required for API products: Request/response schemas that MUST be implemented"
        }
      }
    }
  ]
}
```

**Important:** Set `language` based on the project type in the PRD:
- `.NET / C#` → `"language": "dotnet"`
- `Python` → `"language": "python"`
- `Node.js / TypeScript` → `"language": "nodejs"`
- `Go` → `"language": "go"`

The executing agent will read `.speki/standards/{language}.md` for detailed coding standards.

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

## PRD Intent vs Implementation Details

A PRD defines **WHAT** the product needs, not **HOW** to build it. The decomposition process must respect this boundary.

### What Belongs in the PRD (Requirements)
- **Functional requirements**: What the system must do (behavior)
- **Data contracts for product-facing APIs**: If the product exposes a REST API, those contracts are part of the product specification
- **Acceptance criteria**: Observable, testable outcomes
- **Constraints**: Security, performance, compliance requirements

### What Are Suggestions (Implementation Guidance)
The PRD may include technical suggestions to help the implementer, but these are **guidance, not mandates**:
- **Schema suggestions**: Database schemas, entity structures (the execution agent decides the actual implementation)
- **Code examples**: Sample implementations (the agent may use different patterns)
- **Framework recommendations**: Suggested libraries or tools (the agent evaluates fit)
- **Architectural hints**: Suggested patterns (the agent applies judgment)

### Exception: Product-Facing API Contracts
When the product IS an API (API-first or API-driven), the API specification IS the product. In this case:
- Request/response schemas defined in the PRD are **requirements, not suggestions**
- The execution agent MUST implement APIs that conform to the specified contracts
- This ensures API consumers get the documented behavior

### Using the Context Field

Each story can include a `context` object with two sections:

**`context.suggestions`** - Implementation guidance (agent decides):
```json
"suggestions": {
  "schemas": "CREATE TABLE jobs (id UUID PRIMARY KEY...)",
  "examples": "public class Job : Entity<Guid> {...}",
  "patterns": "Consider using the Repository pattern with Unit of Work"
}
```
The execution agent MAY use these as starting points but is free to implement differently if they see a better approach.

**`context.requirements`** - Mandatory specifications:
```json
"requirements": {
  "apiContracts": {
    "POST /api/jobs": {
      "request": { "name": "string", "priority": "number" },
      "response": { "id": "uuid", "status": "queued" }
    }
  }
}
```
For API-driven products, these contracts MUST be implemented exactly (field names, types, structure). This is the product surface.

**When to use which:**
- Internal implementation details → `suggestions`
- Product-facing API contracts → `requirements.apiContracts`
- If unsure → `suggestions` (let the agent decide)

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

### Task Complexity Assessment

Every story MUST have a `complexity` field. This determines execution strategy:

**LOW complexity** - can be grouped with other low tasks:
- Type/interface definitions only (no implementation logic)
- Simple configuration changes or constants
- Adding enums or value objects with no business logic
- Renaming or restructuring without logic changes
- Documentation-only changes
- Adding simple DTOs or request/response types

**MEDIUM complexity** - execute individually:
- Simple functions with clear input/output
- Basic CRUD operations with standard patterns
- Straightforward UI components
- Single-responsibility services with < 3 dependencies
- Tasks with 3-5 acceptance criteria

**HIGH complexity** - execute individually, may need attention:
- Integration with external services/APIs
- Database schema changes or migrations
- Authentication/authorization logic
- Complex business rules with multiple edge cases
- Tasks with 6+ acceptance criteria
- Tasks that touch multiple bounded contexts
- Anything involving concurrency or state management
- Error handling with retry/fallback logic

**Examples:**
```json
{ "id": "US-001", "title": "Define User entity types", "complexity": "low" }
{ "id": "US-002", "title": "Add UserRepository interface", "complexity": "low" }
{ "id": "US-003", "title": "Implement UserRepository with PostgreSQL", "complexity": "medium" }
{ "id": "US-004", "title": "Add OAuth2 authentication flow", "complexity": "high" }
{ "id": "US-005", "title": "Implement retry logic for external API calls", "complexity": "high" }
```

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

### Description Quality

Descriptions should explain **WHAT** is being created and **WHY** it matters. Include technical context that helps the implementer understand the purpose.

**Bad Descriptions (too vague):**
- "Create the context class"
- "Add the service"
- "Implement the repository"

**Good Descriptions (clear purpose + context):**
- "Create a TenantContext value object to encapsulate organisationId and repositoryId, reducing parameter bloat across method signatures"
- "Add JobRepository implementing IJobRepository with PostgreSQL persistence, enabling jobs to be stored and retrieved across application restarts"
- "Create JobNotFoundException as a typed exception for consistent error handling when jobs are not found, allowing API layer to return proper 404 responses"
- "Implement the CreateJobHandler to orchestrate job creation, validating input, persisting via repository, and returning the created job ID"
- "Add health check endpoint that verifies database connectivity, enabling Kubernetes liveness probes to detect unhealthy instances"

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
