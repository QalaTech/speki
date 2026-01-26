# PRD Decomposition Task

You are a senior product analyst breaking down a Product Requirements Document (PRD) into product-focused user stories. Each story describes a user-facing outcome — **what** the product does and **why** it matters. Stories are product-focused but may include technical detail where it directly aids successful implementation.

## CRITICAL INSTRUCTIONS

Tools policy for this task:

- DO NOT use any tools (no Bash, Read, Grep, Task, etc.).
  The wrapper script will handle peer review automatically after you output JSON.

Workflow:

1. Decompose the PRD and produce a complete tasks JSON (see Output Format).
2. Output ONLY the JSON. The shell will save the draft and run peer review automatically, then produce a final JSON file.

## Your Task

Analyze the PRD provided below and decompose it into small, independent user stories that each describe a **product outcome** a user can experience or verify. Each story must reference the specific PRD sections it derives from, so that a downstream tech spec generator can find and incorporate every relevant detail.

### Peer Review

- The shell will run peer review automatically after you output JSON. Do not call any tools yourself.

- Capture the stdout and extract the first valid JSON object. If `updatedTasks` exists and is valid, minimally merge changes (keep IDs/dependencies stable).

## Output Format

Output ONLY valid JSON in this exact format:

```json
{
  "projectName": "Project name from PRD",
  "branchName": "BRANCH_NAME_HERE",
  "description": "Brief description of the overall feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "As a [role], I want [feature], so that [benefit]",
      "description": "WHAT this story delivers to the user and WHY it matters. Include technical context where it aids implementation success.",
      "acceptanceCriteria": [
        "Observable product behavior the user can verify",
        "Edge case the user would encounter",
        "Error state the user would see"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "dependencies": [],
      "complexity": "low|medium|high",
      "context": {
        "references": [
          "PRD Section 'Authentication' (lines 45-78): OAuth2 requirements and supported providers",
          "PRD Section 'Data Model' (lines 120-145): User entity fields and constraints"
        ],
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

---

## PRD References (MANDATORY)

Every story MUST include `context.references` — an array of strings linking back to the specific PRD sections, headings, or line ranges that informed the story. This is critical because a downstream **tech spec generator** will use these references to find the full requirements and not miss details.

### What to Reference

- **Section headings**: The PRD section(s) this story derives from
- **Line numbers**: Include line ranges when the PRD content is provided with line numbers
- **Specific requirements**: Call out particular requirements, constraints, or specifications from the PRD
- **Diagrams or tables**: Reference any data models, API contracts, or flow diagrams

### Reference Format

Each reference should be a human-readable string:

```json
"references": [
  "PRD Section 'User Registration' (lines 30-52): Email validation rules and password policy",
  "PRD Section 'API Specification' (lines 100-130): POST /api/users request/response contract",
  "PRD Section 'Non-Functional Requirements': 99.9% uptime SLA for auth endpoints"
]
```

### Why This Matters

Without references, the tech spec generator has to guess which parts of the PRD apply to each story. This leads to:

- Missed requirements (the #1 cause of review failures)
- Vague implementation tasks that lack necessary detail
- Back-and-forth between spec and PRD during implementation

---

## Story Title Format

Every story title MUST follow the format: **"As a [role], I want [feature], so that [benefit]"**

**Good titles:**

- "As a new user, I want to create an account, so that I can access the platform"
- "As a project owner, I want to invite team members, so that we can collaborate"
- "As an admin, I want to view audit logs, so that I can track system changes"

**Bad titles (no user focus):**

- "Create User entity with validation" ← pure implementation detail
- "Add IUserRepository interface" ← internal plumbing
- "Set up database migrations" ← infrastructure, not outcome

---

## Technical Detail in Stories

Stories are **product-focused** but should include technical context where it helps ensure successful implementation. The goal is: a tech spec author reading this story should have enough information to write a complete implementation plan without re-reading the entire PRD.

### When to Include Technical Detail

- **API contracts** that are part of the product surface (request/response shapes)
- **Data constraints** that affect user behavior (max lengths, required fields, formats)
- **Integration points** the user depends on (third-party auth, payment gateway, email service)
- **Performance requirements** tied to user experience (response times, throughput)
- **Security constraints** that shape the feature (rate limiting, encryption requirements)

### Where Technical Detail Goes

- **Description**: Include inline when it's essential context (e.g., "supports OAuth2 with Google and GitHub providers")
- **Acceptance criteria**: Include when it's verifiable behavior (e.g., "API responds within 200ms for p95")
- **`context.suggestions`**: Include when it's implementation guidance the agent may use
- **`context.requirements`**: Include when it's a mandatory specification (API contracts)

### What to Avoid

- Implementation decisions that have no user impact (which ORM to use, folder structure)
- Internal architecture (repository pattern, service layers) unless the PRD mandates it
- Test infrastructure or build tooling

**Good description (product-focused with useful technical context):**

> "Allow users to register with email and password. Supports OAuth2 sign-in with Google and GitHub. Email addresses must be verified before account activation. Passwords must meet OWASP guidelines (min 8 chars, complexity check). See PRD Section 'Authentication' for full provider configuration."

**Bad description (pure implementation):**

> "Create UserService with bcrypt hashing, implement IUserRepository with EF Core, add migration for Users table."

---

## Acceptance Criteria

Acceptance criteria describe **observable product behavior** — what a user or tester can verify. Technical criteria are acceptable when they describe verifiable behavior.

**Good criteria:**

- "User receives a confirmation email after registration"
- "Duplicate email addresses are rejected with a clear error message"
- "Dashboard loads within 3 seconds for accounts with up to 1000 items"
- "API returns 429 status when rate limit is exceeded"
- "Password reset tokens expire after 24 hours"

**Bad criteria (unverifiable internals):**

- "UserRepository persists to PostgreSQL" ← user can't verify this
- "Code uses the strategy pattern" ← architectural choice, not behavior
- "Entity Framework migrations run successfully" ← internal tooling

---

## MANDATORY ACCEPTANCE CRITERIA

Every story MUST include:

### Product Quality

- No placeholder behavior (everything the story promises must work)
- Error states provide clear, user-facing messages
- The feature is accessible from the appropriate entry point (UI, API, CLI)

### Code Quality

- No TODO or FIXME comments left in code
- No commented-out code committed
- No magic strings or numbers - use constants
- Code follows existing project patterns and conventions

---

## PRD Intent vs Implementation Details

A PRD defines **WHAT** the product needs, not **HOW** to build it. Stories must respect this boundary while capturing enough detail for a tech spec author to succeed.

### What Belongs in Stories (Requirements)

- **Functional requirements**: What the system must do (behavior)
- **Data contracts for product-facing APIs**: If the product exposes a REST API, those contracts are part of the product specification
- **Acceptance criteria**: Observable, testable outcomes
- **Constraints**: Security, performance, compliance requirements
- **Technical context from the PRD**: Data models, integration specs, protocol requirements

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

Each story can include a `context` object with three sections:

**`context.references`** - PRD traceability (MANDATORY):

```json
"references": [
  "PRD Section 'Authentication' (lines 45-78): OAuth2 flow and provider config",
  "PRD Section 'Data Model' (lines 120-145): User entity fields"
]
```

The tech spec generator uses these to find the full requirements in the PRD.

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

- PRD section traceability → `references` (always include)
- Internal implementation details → `suggestions`
- Product-facing API contracts → `requirements.apiContracts`
- If unsure → `suggestions` (let the agent decide)

---

## Rules for Decomposition

### Story Size

- Each story must represent a **single user-facing capability** or behavior
- If a story covers multiple distinct user actions, split it further
- A story is too big if it describes more than one user workflow

### Cleanup Responsibilities

When a story introduces temporary/stub behavior to unblock progress, the dependent story MUST clean it up:

- If Story A adds a placeholder that Story B replaces → Story B's acceptance criteria must include removing the placeholder
- **Always explicitly state cleanup in acceptance criteria** - don't assume the agent will notice

**Example:**

```json
{
  "id": "US-005",
  "title": "As a user, I want to reset my password, so that I can regain access to my account",
  "acceptanceCriteria": [
    "User can request a password reset via email",
    "User receives a reset link that expires after 24 hours",
    "User can set a new password using the reset link",
    "Previous sessions are invalidated after password reset",
    "Remove placeholder 'contact support' message from US-002"
  ],
  "dependencies": ["US-002"],
  "context": {
    "references": [
      "PRD Section 'Password Recovery' (lines 80-95): Reset flow and token expiry rules",
      "PRD Section 'Security Requirements' (lines 200-210): Session invalidation on credential change"
    ]
  }
}
```

### Story Ordering

Order stories by **product value flow**, not implementation layers:

1. **Core flows (priority 1-20)**: The primary user journeys that define the product's core value
2. **Supporting flows (priority 21-40)**: Secondary features that enhance the core experience
3. **Edge cases (priority 41-60)**: Error handling, validation, and boundary conditions users may encounter
4. **Polish (priority 61+)**: Nice-to-have improvements, accessibility, performance optimizations

### Task Complexity Assessment

Every story MUST have a `complexity` field. This determines execution strategy:

**LOW complexity** - can be grouped with other low tasks:

- Simple configuration or settings changes
- Single-screen UI additions with no business logic
- Adding simple informational displays
- Documentation-only changes

**MEDIUM complexity** - execute individually:

- Standard CRUD workflows
- Forms with validation
- Basic integrations with clear contracts
- Features with 3-5 acceptance criteria

**HIGH complexity** - execute individually, may need attention:

- Multi-step user workflows spanning multiple screens
- Integration with external services/APIs
- Authentication/authorization features
- Features with 6+ acceptance criteria
- Anything involving real-time updates or complex state
- Features with significant error handling requirements

### Good vs Bad Stories

**Too Big (Bad):**

- "As a user, I want full account management" ← multiple features
- "As an admin, I want the entire dashboard" ← too broad

**Right Size (Good):**

- "As a new user, I want to create an account, so that I can access the platform"
- "As a user, I want to update my profile, so that my information stays current"
- "As a user, I want to search for items, so that I can find what I need quickly"
- "As an admin, I want to view active users, so that I can monitor engagement"

### Description Quality

Descriptions should explain **WHAT** the product delivers, **WHY** it matters, and include enough technical context for a tech spec author to write an implementation plan without re-reading the full PRD.

**Bad Descriptions (too vague or pure implementation):**

- "Create the context class" ← implementation detail
- "Add the service" ← no user value
- "Implement the repository" ← internal plumbing

**Good Descriptions (clear outcome with useful context):**

- "Allow users to register with email and password. Supports OAuth2 with Google and GitHub. Email verification required before activation. See PRD 'Authentication' section for provider configuration and OWASP password requirements."
- "Enable project owners to invite collaborators by email with role assignment (viewer, editor, admin). Invitations expire after 7 days. See PRD 'Team Management' for role permissions matrix."
- "Provide real-time notification when a task is assigned via WebSocket push. Fallback to polling for clients that don't support WebSocket. See PRD 'Notifications' for event types and delivery guarantees."

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

## Important

- Output ONLY the JSON, no explanations before or after
- Ensure valid JSON syntax
- Include ALL mandatory acceptance criteria in every story
- **Every story MUST include `context.references`** linking to specific PRD sections
- **Do NOT include `testCases`** — test design is a tech-spec concern
- Include technical detail where it aids implementation success
- Set all `passes` to `false`
- Use the branch name provided below
- Never compromise on code quality for speed
- Do not use any tools in this step. The wrapper will peer review your JSON and save draft/final copies.
