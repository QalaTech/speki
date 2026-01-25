/**
 * Focused prompts for standalone spec review (FR-7)
 * Each prompt has a single responsibility and outputs structured JSON.
 */

// File output instruction - agents write their verdict to a JSON file
// This is appended at runtime by buildPrompt with the actual output path
export function buildFileOutputInstruction(outputPath: string, promptName: string, category: string): string {
  return `

## CRITICAL - OUTPUT REQUIREMENTS

You MUST write your review result to a JSON file. Do NOT output JSON in your response.

**Output file path:** \`${outputPath}\`

Use your file write tool to create this file with the following structure:

\`\`\`json
{
  "verdict": "PASS",
  "promptName": "${promptName}",
  "category": "${category}",
  "issues": ["issue description here"],
  "suggestions": []
}
\`\`\`

**Verdict values:** Use exactly one of: \`"PASS"\`, \`"FAIL"\`, or \`"NEEDS_IMPROVEMENT"\`

**Verdict guidelines:**
- PASS: No significant issues found
- FAIL: Critical issues that must be resolved
- NEEDS_IMPROVEMENT: Issues that should be addressed but are not blockers

**Suggestions format** (include when there are issues):
\`\`\`json
{
  "id": "issue-1",
  "severity": "warning",
  "issue": "Description",
  "suggestedFix": "How to fix"
}
\`\`\`

After writing the file, confirm: "Verdict written to ${outputPath}"
`;
}

// Legacy constant for backwards compatibility (will be removed)
const JSON_CLOSING_INSTRUCTION = `Analyze the spec and return your response in JSON format.`;

/**
 * Critical guidance about factual claims - appended to prompts that might
 * involve external knowledge (versions, APIs, libraries, etc.)
 */
const FACTUAL_CLAIMS_WARNING = `
## CRITICAL: Factual Claims Policy
You MUST NOT make claims about:
- Software version releases, release dates, or version availability
- Current API specifications or library features you haven't verified
- Whether specific technologies exist or are deprecated
- Any external facts that could become outdated

If the spec mentions specific versions, technologies, or external dependencies:
- Do NOT claim they don't exist or aren't released
- Do NOT claim features are missing from specific versions
- Instead, use \`"type": "comment"\` to ask clarifying questions like "Please verify this version is correct for your deployment timeline"
- Focus ONLY on the spec's internal consistency, clarity, and completeness

Your knowledge has a cutoff date. The spec author likely has more current information about their technology choices.`;

/**
 * Builds the common spec/codebase context header used by all prompts.
 */
function buildContextHeader(): string {
  return `## SPEC FILE
**IMPORTANT**: First, read the spec file at: {specPath}
Use your Read tool to read this file - it will show line numbers which you MUST use when reporting issues.

## CODEBASE CONTEXT
{codebaseContext}`;
}

/**
 * Builds the common severity classification section.
 */
function buildSeveritySection(descriptions: {
  critical: string;
  warning: string;
  info: string;
}): string {
  return `### Severity Classification
- **Critical**: ${descriptions.critical}
- **Warning**: ${descriptions.warning}
- **Info**: ${descriptions.info}`;
}

/**
 * Builds the standard suggestion output format used by most prompts.
 */
function buildStandardOutputFormat(
  promptName: string,
  category: string
): string {
  return `## EXPECTED OUTPUT FORMAT
Return a JSON object with this exact structure:

\`\`\`json
{
  "verdict": "PASS" | "FAIL" | "NEEDS_IMPROVEMENT",
  "promptName": "${promptName}",
  "category": "${category}",
  "issues": [
    "List of ${category} issues"
  ],
  "suggestions": [
    {
      "id": "unique-id",
      "category": "${category}",
      "severity": "critical" | "warning" | "info",
      "type": "change" | "comment",
      "section": "Section name where issue found",
      "lineStart": number | null,
      "lineEnd": number | null,
      "textSnippet": "Relevant text from spec (required for 'change' type)",
      "issue": "Description of the issue",
      "suggestedFix": "Proposed replacement text (for 'change') OR clarifying question/comment (for 'comment')",
      "status": "pending",
      "tags": ["security", "api"]
    }
  ],
  "durationMs": 0
}
\`\`\`

### Line Number Guidelines
- **lineStart/lineEnd**: Count actual line numbers in the spec content (1-indexed). Find the exact lines containing the problematic text.
- For "change" type suggestions, line numbers are REQUIRED - locate the exact lines to modify.
- For "comment" type suggestions about overall structure, you may use null if no specific line applies.
- The textSnippet should match text found at the specified line range.

### Suggestion Type Guidelines
- Use \`"type": "change"\` when you have specific text to replace (textSnippet + suggestedFix as concrete text modification)
- Use \`"type": "comment"\` when asking a clarifying question, noting a general concern, or the issue requires human judgment

### Tags Guidelines
- **tags**: Array of domain/concern tags that apply to this suggestion. Choose from:
  - \`security\` - Auth, vulnerabilities, data protection, encryption
  - \`performance\` - Speed, optimization, caching, latency
  - \`scalability\` - Load handling, growth, horizontal scaling
  - \`data\` - Data models, privacy, GDPR, storage
  - \`api\` - API design, contracts, endpoints, versioning
  - \`ux\` - User experience, usability, flows
  - \`accessibility\` - A11y, WCAG compliance, screen readers
  - \`architecture\` - System design, patterns, dependencies
  - \`testing\` - Test coverage, test strategy, testability
  - \`infrastructure\` - Deployment, DevOps, CI/CD, monitoring
  - \`error-handling\` - Error cases, edge cases, fallbacks
  - \`documentation\` - Docs, comments, clarity of explanation
- Include relevant tags per suggestion. A suggestion can have multiple tags.`;
}

/**
 * Builds standard verdict guidelines.
 */
function buildVerdictGuidelines(descriptions: {
  pass: string;
  fail: string;
  needsImprovement: string;
}): string {
  return `### Verdict Guidelines
- **PASS**: ${descriptions.pass}
- **FAIL**: ${descriptions.fail}
- **NEEDS_IMPROVEMENT**: ${descriptions.needsImprovement}`;
}

/**
 * GOD_SPEC_DETECTION_PROMPT - Detects specifications that are too large/complex
 *
 * Indicators from FR-7a (size, scope, cohesion):
 * - Size: >3 feature sections, >2000 words, >15-20 estimated stories
 * - Scope: multiple user journeys, independent features, >3 system boundaries
 * - Cohesion: no single definition of done, different personas, weak dependencies
 *
 * Includes split proposal format from FR-7b
 */
export const GOD_SPEC_DETECTION_PROMPT = `You are analyzing a specification document for "god spec" indicators - signs that the spec is too large, too broad, or lacks cohesion and should be split into smaller, focused specs.

${buildContextHeader()}

## RULES FOR EVALUATION

### Size Indicators (check all)
1. **Feature Section Count**: More than 3 major feature sections suggests scope creep
2. **Word Count**: Specifications over 2000 words are difficult to review and implement atomically
3. **Estimated Stories**: If decomposition would yield >15-20 user stories, the spec is too large

### Scope Indicators (check all)
1. **User Journeys**: Multiple distinct user journeys (e.g., admin workflow AND end-user workflow AND integration flow) indicate multiple specs
2. **Independent Features**: Features that could be implemented and deployed independently should be separate specs
3. **System Boundaries**: Touching >3 distinct system boundaries (e.g., auth, payments, notifications, analytics) suggests over-scoping

### Cohesion Indicators (check all)
1. **Definition of Done**: If there's no single, clear "when is this complete?" the spec lacks focus
2. **Personas**: Different primary personas (admin vs user vs developer) indicate separate concerns
3. **Dependency Strength**: If features within the spec have weak or no dependencies on each other, they should be separate

### God Spec Threshold
A spec is flagged as a "god spec" when **2 or more indicators** from different categories are present.

## EXPECTED OUTPUT FORMAT
Return a JSON object with this exact structure:

\`\`\`json
{
  "verdict": "PASS" | "SPLIT_RECOMMENDED",
  "isGodSpec": boolean,
  "indicators": [
    "Description of each indicator found (be specific)"
  ],
  "estimatedStories": number,
  "featureDomains": [
    "List of distinct feature domains identified"
  ],
  "systemBoundaries": [
    "List of system boundaries this spec touches"
  ],
  "splitProposal": {
    "reason": "Why this spec should be split (only if isGodSpec is true)",
    "proposedSpecs": [
      {
        "filename": "{basename}.{feature-name}.md",
        "description": "What this spec covers",
        "estimatedStories": number,
        "sections": ["List of sections from original to include"]
      }
    ]
  } | null,
  "issues": [
    "Any specific issues found during analysis"
  ],
  "suggestions": []
}
\`\`\`

### Split Proposal Naming Convention
- Use the pattern: \`{basename}.{feature-name}.md\`
- Feature names should be kebab-case, 1-3 words
- Each proposed spec should target 5-15 stories

`;

/**
 * REQUIREMENTS_COMPLETENESS_PROMPT - Checks for missing requirements
 *
 * Evaluates whether the spec has all necessary requirements for implementation
 */
export const REQUIREMENTS_COMPLETENESS_PROMPT = `You are analyzing a specification document for completeness. Your goal is to identify missing requirements that would prevent successful implementation.

${buildContextHeader()}

## RULES FOR EVALUATION

### Functional Requirements Checklist
1. **User Actions**: Every user-facing feature must describe what actions users can take
2. **System Responses**: Each action must specify expected system behavior/response
3. **Data Requirements**: Required data fields, validation rules, and storage needs
4. **Edge Cases**: Handling for empty states, errors, and boundary conditions
5. **Permissions**: Who can perform each action (roles/permissions)

### Technical Requirements Checklist
1. **API Contracts**: If APIs are involved, endpoints, methods, request/response formats
2. **Data Models**: Schema definitions or references for new/modified entities
3. **Integration Points**: External systems or services being integrated with
4. **Performance Constraints**: Load expectations, response time requirements
5. **Security Requirements**: Authentication, authorization, data protection needs

${buildSeveritySection({
  critical: "Implementation cannot proceed without this information",
  warning: "Ambiguity that could lead to incorrect implementation",
  info: "Nice-to-have clarification that would improve the spec",
})}

${buildStandardOutputFormat("requirements_completeness", "completeness")}

${buildVerdictGuidelines({
  pass: "All critical requirements present, minor gaps at most",
  fail: "Critical requirements missing that block implementation",
  needsImprovement: "No critical gaps but significant warnings present",
})}
${FACTUAL_CLAIMS_WARNING}

`;

/**
 * CLARITY_SPECIFICITY_PROMPT - Checks for ambiguous or vague requirements
 *
 * Identifies language that could lead to misinterpretation
 */
export const CLARITY_SPECIFICITY_PROMPT = `You are analyzing a specification document for clarity and specificity. Your goal is to identify ambiguous language that could lead to misinterpretation during implementation.

${buildContextHeader()}

## RULES FOR EVALUATION

### Ambiguity Indicators
1. **Vague Quantifiers**: "some", "few", "many", "several", "various" without specific numbers
2. **Undefined Terms**: Technical terms or domain concepts not defined in the spec
3. **Subjective Language**: "user-friendly", "fast", "intuitive", "seamless" without measurable criteria
4. **Implicit Assumptions**: References to behavior "as usual" or "as expected" without definition
5. **Missing Actors**: Passive voice hiding who performs actions ("should be validated" - by whom?)

### Specificity Requirements
1. **Measurable Outcomes**: Performance requirements must have numbers (e.g., "<200ms response time")
2. **Concrete Examples**: Complex flows should include examples or sample data
3. **Explicit Defaults**: Default values must be stated, not assumed
4. **Clear Boundaries**: Scope limits explicitly defined (what's NOT included)
5. **Unambiguous Language**: Replace "should" with "must" where mandatory

${buildSeveritySection({
  critical: "Ambiguity that could result in fundamentally wrong implementation",
  warning: "Ambiguity that could cause rework or misaligned expectations",
  info: "Minor clarity improvements that would enhance understanding",
})}

${buildStandardOutputFormat("clarity_specificity", "clarity")}

${buildVerdictGuidelines({
  pass: "Spec is clear and specific, minor improvements only",
  fail: "Critical ambiguities that could cause major misimplementation",
  needsImprovement: "Several warnings that should be addressed",
})}
${FACTUAL_CLAIMS_WARNING}

`;

/**
 * TESTABILITY_PROMPT - Checks whether requirements can be verified
 *
 * Ensures each requirement has clear acceptance criteria that can be tested
 */
export const TESTABILITY_PROMPT = `You are analyzing a specification document for testability. Your goal is to identify requirements that cannot be objectively verified or tested.

${buildContextHeader()}

## RULES FOR EVALUATION

### Testability Requirements
1. **Observable Outcomes**: Every requirement must have a verifiable outcome
2. **Clear Inputs/Outputs**: Test cases need defined inputs and expected outputs
3. **Measurable Criteria**: Quantifiable metrics where performance matters
4. **Reproducible Steps**: Complex behaviors need step-by-step verification paths
5. **State Definitions**: Clear before/after states for operations that modify data

### Untestable Patterns (Flag These)
1. **Unmeasurable Quality**: "System should be reliable" without defining reliability metrics
2. **Undefined Behavior**: "Handle errors appropriately" without specifying how
3. **Missing Success Criteria**: Features without clear "done" definition
4. **Hidden Dependencies**: Behavior depending on external factors not specified
5. **Circular Definitions**: Requirements that reference themselves for validation

### Test Case Derivation
For each major feature, you should be able to derive:
- At least one happy path test
- At least one error/edge case test
- Clear pass/fail criteria

${buildSeveritySection({
  critical: "Core functionality cannot be verified",
  warning: "Feature testable but acceptance criteria unclear",
  info: "Suggestion to add explicit test scenarios",
})}

${buildStandardOutputFormat("testability", "testability")}

${buildVerdictGuidelines({
  pass: "All requirements are testable with clear acceptance criteria",
  fail: "Core requirements cannot be verified",
  needsImprovement: "Some requirements need clearer success criteria",
})}

`;

/**
 * SCOPE_VALIDATION_PROMPT - Validates scope against codebase context
 *
 * Ensures the spec aligns with existing architecture and doesn't overreach
 */
export const SCOPE_VALIDATION_PROMPT = `You are analyzing a specification document for scope validity. Your goal is to validate that the scope is appropriate given the existing codebase context and doesn't introduce unnecessary complexity or architectural conflicts.

${buildContextHeader()}

## RULES FOR EVALUATION

### Architectural Alignment
1. **Existing Patterns**: Does the spec follow established patterns in the codebase?
2. **Technology Consistency**: Does it use technologies already in the stack or introduce new ones?
3. **Module Boundaries**: Does it respect existing module/service boundaries?
4. **Data Model Fit**: Do proposed data structures align with existing models?
5. **API Style Consistency**: Do new APIs match existing API conventions?

### Scope Appropriateness
1. **Single Responsibility**: Does the spec focus on one cohesive feature?
2. **Incremental Change**: Can this be implemented without major refactoring?
3. **Dependency Count**: Reasonable number of dependencies (internal and external)
4. **Integration Surface**: Limited touch points with existing systems
5. **Rollback Strategy**: Can changes be safely rolled back if needed?

### Risk Assessment
1. **Breaking Changes**: Changes that would break existing functionality
2. **Migration Requirements**: Data migrations or schema changes needed
3. **Cross-cutting Concerns**: Changes affecting multiple unrelated systems
4. **Technical Debt**: Does this add or reduce technical debt?
5. **Future Flexibility**: Does this constrain or enable future development?

${buildSeveritySection({
  critical:
    "Architectural violation or scope that would cause system-wide issues",
  warning:
    "Scope concern that should be reconsidered or requires justification",
  info: "Suggestion for better alignment with existing patterns",
})}

${buildStandardOutputFormat("scope_validation", "scope")}

${buildVerdictGuidelines({
  pass: "Scope is well-defined and aligns with codebase architecture",
  fail: "Scope violates architecture or would cause significant problems",
  needsImprovement: "Scope needs refinement for better alignment",
})}
${FACTUAL_CLAIMS_WARNING}

`;

// =============================================================================
// ENHANCED PRD REVIEW PROMPTS
// These prompts focus on PRD-specific quality criteria
// =============================================================================

/**
 * PRD_E2E_FLOW_PROMPT - Analyzes end-to-end user flows for completeness
 *
 * Detects missing flows, incomplete happy/error paths, and flow gaps
 */
export const PRD_E2E_FLOW_PROMPT = `You are analyzing a Product Requirements Document (PRD) for end-to-end flow completeness. Your goal is to identify user flows that are incomplete or missing.

${buildContextHeader()}

## RULES FOR EVALUATION

### Flow Analysis
1. **Entry Points**: Every user journey must have a clear starting point (how does the user get here?)
2. **Happy Path**: Each feature must describe the successful flow from start to completion
3. **Error Paths**: What happens when things go wrong? Network errors, validation failures, timeouts
4. **Exit Points**: Every flow must have clear completion criteria (success state, confirmation, next steps)
5. **Edge Cases**: Boundary conditions, empty states, concurrent operations

### Common Missing Flows
1. **Onboarding**: First-time user experience often overlooked
2. **Recovery Flows**: Password reset, session timeout, data recovery
3. **Cancellation/Undo**: How to reverse or cancel an operation mid-flow
4. **State Transitions**: What happens between states (loading, pending, processing)
5. **Multi-device/Session**: Same user on multiple devices, browser tabs, sessions
6. **Offline/Degraded**: Behavior when connectivity is poor or unavailable
7. **Batch Operations**: Bulk actions, imports, exports

### Flow Diagram Mental Model
For each feature, you should be able to trace:
\`\`\`
Entry → Preconditions → Actions → Validations → Success/Error → Exit/Next
\`\`\`

If any segment is missing or vague, flag it.

### System Boundaries
Check flows that cross system boundaries:
1. **Authentication**: Login, logout, session management
2. **External APIs**: Third-party integrations, webhooks
3. **Background Jobs**: Async operations, scheduled tasks
4. **Notifications**: Email, push, in-app alerts

${buildSeveritySection({
  critical:
    "Major user flow is incomplete or missing entirely - users cannot complete core tasks",
  warning:
    "Error path or edge case flow is missing - could cause user confusion",
  info: "Minor flow optimization or alternative path suggestion",
})}

${buildStandardOutputFormat("e2e_flow_analysis", "flow")}

${buildVerdictGuidelines({
  pass: "All user flows are complete with clear entry, actions, and exit points",
  fail: "Critical user flows are incomplete or missing",
  needsImprovement: "Some flows need error handling or edge case coverage",
})}

`;

/**
 * PRD_BEST_PRACTICES_PROMPT - Validates PRD against industry best practices
 *
 * Checks for personas, goals, success metrics, and PRD structure
 */
export const PRD_BEST_PRACTICES_PROMPT = `You are analyzing a Product Requirements Document (PRD) against industry best practices. Your goal is to ensure the PRD follows proven patterns for successful product definition.

${buildContextHeader()}

## RULES FOR EVALUATION

### PRD Structure Best Practices
1. **Problem Statement**: Clear articulation of the problem being solved
2. **User Personas**: Defined target users with roles, goals, and pain points
3. **Goals & Non-Goals**: Explicit scope - what we WILL and WON'T build
4. **Success Metrics**: Measurable KPIs to evaluate feature success
5. **User Stories/Requirements**: Actionable, prioritized requirements

### Problem Definition Quality
1. **Customer Pain**: Is the user pain point clearly articulated?
2. **Business Value**: Why is this worth building? ROI, revenue, retention?
3. **Market Context**: Competitive landscape, timing, market need
4. **Constraints**: Budget, timeline, technical, regulatory limitations

### Persona Best Practices
1. **Named Personas**: "Admin Alice", "Customer Carol" - not just "the user"
2. **Goals per Persona**: What does each persona want to achieve?
3. **Pain Points**: Current frustrations or unmet needs
4. **Context of Use**: When, where, and how they'll use this feature
5. **Anti-Personas**: Who is this NOT for? (helps scope)

### Success Metrics (SMART)
1. **Specific**: Concrete metric, not vague ("increase engagement")
2. **Measurable**: Can be quantified ("increase DAU by 10%")
3. **Achievable**: Realistic given scope and timeline
4. **Relevant**: Tied to business objectives
5. **Time-bound**: Target date or time frame

### Goals vs Non-Goals
A good PRD explicitly states:
- **Goals**: What this feature will definitely deliver
- **Non-Goals**: What's explicitly out of scope (prevents scope creep)
- **Future Considerations**: Things we might do later

### Common PRD Anti-Patterns
1. **Solution-first**: Jumping to "how" before defining "what" and "why"
2. **God PRD**: Trying to solve everything at once
3. **Vague Success**: "Make users happy" without metrics
4. **No Priorities**: Everything is P0 (nothing is P0)
5. **Implementation Details**: Prescribing architecture in a PRD
6. **Missing "Why"**: Features without justification

${buildSeveritySection({
  critical:
    "Missing essential PRD element (problem statement, personas, or success metrics)",
  warning: "PRD element present but weak or incomplete",
  info: "Suggestion to strengthen PRD with best practices",
})}

${buildStandardOutputFormat("prd_best_practices", "best_practices")}

${buildVerdictGuidelines({
  pass: "PRD follows best practices with clear problem, personas, and success metrics",
  fail: "PRD missing essential elements or has major structural issues",
  needsImprovement: "PRD has most elements but needs strengthening",
})}

`;

// =============================================================================
// TECH SPEC STORY ALIGNMENT PROMPT
// Reviews tech spec against parent PRD user stories
// =============================================================================

/**
 * TECH_SPEC_STORY_ALIGNMENT_PROMPT - Validates tech spec covers parent user stories
 *
 * Used when reviewing a tech spec that has a parent PRD
 */
export const TECH_SPEC_STORY_ALIGNMENT_PROMPT = `You are reviewing a Technical Specification against its parent PRD's user stories. Your goal is to ensure the tech spec adequately addresses ALL user stories from the PRD.

## PARENT USER STORIES
{parentUserStories}

## TECHNICAL SPECIFICATION
{techSpecContent}

## CODEBASE CONTEXT
{codebaseContext}

## RULES FOR EVALUATION

### Story Coverage Analysis
1. **Complete Coverage**: Every user story from the PRD must be addressed by the tech spec
2. **Acceptance Criteria Alignment**: Tech spec implementation must satisfy story acceptance criteria
3. **No Orphan Features**: Tech spec should not include features not traceable to user stories
4. **Priority Preservation**: High-priority stories should have proportional technical detail

### Technical Feasibility Check
1. **Implementation Path**: For each user story, is there a clear technical path?
2. **Dependency Mapping**: Are technical dependencies aligned with story dependencies?
3. **Risk Assessment**: Are technically risky stories identified and mitigated?
4. **Architecture Fit**: Does the tech approach fit the existing codebase architecture?

### Common Alignment Issues
1. **Scope Creep**: Tech spec adds features beyond user stories (gold-plating)
2. **Partial Coverage**: Story mentioned but acceptance criteria not fully addressed
3. **Implementation Gap**: Story covered conceptually but no concrete implementation details
4. **Contradiction**: Technical approach would not satisfy story acceptance criteria

### Traceability Matrix
For each user story, identify:
- Which tech spec sections address it
- What implementation details are provided
- Whether all acceptance criteria are technically covered

### Severity Guide
- **critical**: User story has NO coverage in tech spec
- **warning**: User story partially covered or acceptance criteria not fully addressed
- **info**: Suggestion to improve traceability or technical detail

## OUTPUT FORMAT
Return a JSON object:
{
  "analysisName": "tech_spec_story_alignment",
  "category": "alignment",
  "verdict": "pass" | "fail" | "needs_improvement",
  "summary": "Brief assessment of story coverage",
  "storyAnalysis": [
    {
      "storyId": "US-001",
      "storyTitle": "Story title",
      "coverage": "full" | "partial" | "none",
      "techSpecSections": ["Section names that address this story"],
      "acceptanceCriteriaCoverage": {
        "total": number,
        "covered": number,
        "gaps": ["List of acceptance criteria not covered"]
      }
    }
  ],
  "orphanFeatures": ["Features in tech spec with no user story"],
  "suggestions": [
    {
      "storyId": "US-001" | "tech_spec",
      "type": "missing_coverage" | "partial_coverage" | "orphan_feature",
      "severity": "critical" | "warning" | "info",
      "message": "Description of the issue",
      "suggestion": "How to resolve"
    }
  ]
}

Focus on ensuring every user story has clear technical implementation details.

`;

// =============================================================================
// DECOMPOSE REVIEW PROMPTS (FR-6)
// These prompts compare spec document against generated tasks JSON.
// They run WITHOUT tools - pure document comparison.
// =============================================================================

/**
 * Builds the common spec/tasks context header used by decompose review prompts.
 */
function buildDecomposeContextHeader(): string {
  return `## SPEC CONTENT
{specContent}

## GENERATED TASKS JSON
{tasksJson}`;
}

/**
 * Builds the standard decompose review output format.
 */
function buildDecomposeOutputFormat(
  promptName: string,
  category: string
): string {
  return `## EXPECTED OUTPUT FORMAT
Return a JSON object with this exact structure:

\`\`\`json
{
  "verdict": "PASS" | "FAIL",
  "promptName": "${promptName}",
  "category": "${category}",
  "issues": [
    {
      "id": "unique-id",
      "severity": "critical" | "warning" | "info",
      "description": "Description of the issue",
      "specSection": "Section in spec where requirement is defined",
      "affectedTasks": ["US-001", "US-002"],
      "suggestedFix": "How to resolve this issue"
    }
  ],
  "summary": "Brief summary of findings",
  "durationMs": 0
}
\`\`\``;
}

/**
 * Builds severity classification for decompose review prompts.
 */
function buildDecomposeSeveritySection(descriptions: {
  critical: string;
  warning: string;
  info: string;
}): string {
  return `### Severity Classification
- **Critical**: ${descriptions.critical}
- **Warning**: ${descriptions.warning}
- **Info**: ${descriptions.info}`;
}

/**
 * Builds verdict guidelines for decompose review prompts (PASS/FAIL only).
 */
function buildDecomposeVerdictGuidelines(descriptions: {
  pass: string;
  fail: string;
}): string {
  return `### Verdict Guidelines
- **PASS**: ${descriptions.pass}
- **FAIL**: ${descriptions.fail}`;
}

/**
 * MISSING_REQUIREMENTS_PROMPT - Detects requirements in spec not covered by tasks
 *
 * Compares spec requirements against generated tasks to find gaps
 */
export const MISSING_REQUIREMENTS_PROMPT = `You are analyzing a specification document against a set of generated tasks. Your goal is to identify any requirements in the spec that are NOT covered by the generated tasks.

${buildDecomposeContextHeader()}

## RULES FOR EVALUATION

### Completeness Checks
1. **Functional Requirements**: Every functional requirement in the spec must have at least one task addressing it
2. **Acceptance Criteria**: All acceptance criteria listed in the spec must be covered by task acceptance criteria
3. **Edge Cases**: Error handling, validation, and edge cases mentioned in spec must have corresponding tasks
4. **Non-Functional Requirements**: Performance, security, and other non-functional requirements must be addressed
5. **Integration Points**: All integration requirements must have tasks

### How to Identify Missing Coverage
1. Parse each requirement section in the spec
2. For each requirement, search for tasks that explicitly address it
3. Check if task acceptance criteria collectively cover spec requirements
4. Flag requirements with no matching task coverage

${buildDecomposeSeveritySection({
  critical: "Core functionality requirement not covered by any task",
  warning: "Secondary requirement or edge case missing coverage",
  info: "Nice-to-have or implicit requirement not explicitly tasked",
})}

${buildDecomposeOutputFormat("missing_requirements", "coverage")}

${buildDecomposeVerdictGuidelines({
  pass: "All requirements in spec have corresponding task coverage",
  fail: "One or more requirements lack task coverage",
})}

`;

/**
 * CONTRADICTIONS_PROMPT - Detects contradictions between spec and tasks
 *
 * Finds where tasks contradict spec requirements or each other
 */
export const CONTRADICTIONS_PROMPT = `You are analyzing a specification document against a set of generated tasks. Your goal is to identify any contradictions between the spec and the tasks, or contradictions between tasks themselves.

${buildDecomposeContextHeader()}

## RULES FOR EVALUATION

### Types of Contradictions

#### Spec-Task Contradictions
1. **Behavioral Conflicts**: Task describes behavior that contradicts spec
2. **Data Type Mismatches**: Task uses different data types than spec defines
3. **API Contract Violations**: Task acceptance criteria violates spec's API contracts
4. **Business Logic Conflicts**: Task implements logic differently than spec requires
5. **Scope Violations**: Task exceeds or falls short of spec scope

#### Task-Task Contradictions
1. **Duplicate Responsibilities**: Multiple tasks claim to implement the same thing differently
2. **Conflicting Outputs**: Tasks produce outputs that would conflict
3. **Dependency Conflicts**: Task A depends on B, but B's output doesn't match A's input needs
4. **Ordering Contradictions**: Tasks assume different execution orders that conflict

${buildDecomposeSeveritySection({
  critical: "Direct contradiction that would cause implementation failure",
  warning: "Inconsistency that could lead to confusion or rework",
  info: "Minor discrepancy that should be clarified",
})}

${buildDecomposeOutputFormat("contradictions", "consistency")}

${buildDecomposeVerdictGuidelines({
  pass: "No contradictions found between spec and tasks or between tasks",
  fail: "One or more contradictions detected that need resolution",
})}

`;

/**
 * DEPENDENCY_VALIDATION_PROMPT - Validates task dependencies are correct
 *
 * Checks that task dependencies form a valid DAG and match logical requirements
 */
export const DEPENDENCY_VALIDATION_PROMPT = `You are analyzing a specification document against a set of generated tasks. Your goal is to validate that task dependencies are correctly defined and form a valid execution order.

${buildDecomposeContextHeader()}

## RULES FOR EVALUATION

### Dependency Correctness
1. **Missing Dependencies**: Task requires output from another task but doesn't list it as dependency
2. **Unnecessary Dependencies**: Task lists dependencies it doesn't actually need
3. **Circular Dependencies**: Tasks form a cycle (A depends on B, B depends on A)
4. **Implicit Dependencies**: Tasks have implicit ordering requirements not captured in dependencies
5. **Type Dependencies**: If Task B uses types/interfaces defined in Task A, B must depend on A

### Logical Order Validation
1. **Foundation First**: Infrastructure/setup tasks should be early with few dependencies
2. **Feature Flow**: Feature implementation should follow logical build-up order
3. **Integration Order**: Integration tasks should depend on component tasks
4. **Test Dependencies**: Test tasks should depend on implementation tasks they test

### Common Issues
1. **Database before API**: Tasks creating DB entities should precede API tasks using them
2. **Types before Implementation**: Type definition tasks should precede usage tasks
3. **Core before Extensions**: Core functionality before optional features
4. **Setup before Use**: Configuration/setup before dependent features

${buildDecomposeSeveritySection({
  critical:
    "Circular dependency or missing critical dependency that blocks execution",
  warning: "Missing dependency that could cause implementation issues",
  info: "Unnecessary dependency that could be removed for efficiency",
})}

${buildDecomposeOutputFormat("dependency_validation", "dependencies")}

${buildDecomposeVerdictGuidelines({
  pass: "All dependencies are valid and form a correct execution DAG",
  fail: "Dependency issues found that need correction",
})}

`;

/**
 * DUPLICATE_DETECTION_PROMPT - Detects duplicate or overlapping tasks
 *
 * Identifies tasks that implement the same functionality
 */
export const DUPLICATE_DETECTION_PROMPT = `You are analyzing a specification document against a set of generated tasks. Your goal is to identify duplicate or significantly overlapping tasks that should be merged.

${buildDecomposeContextHeader()}

## RULES FOR EVALUATION

### Types of Duplication

#### Exact Duplicates
1. **Same Title/Description**: Tasks with identical or near-identical descriptions
2. **Same Acceptance Criteria**: Tasks with matching acceptance criteria
3. **Same Implementation**: Tasks that would implement the same code

#### Overlapping Tasks
1. **Partial Overlap**: Tasks that both implement parts of the same feature
2. **Scope Overlap**: Tasks with acceptance criteria that overlap significantly
3. **Redundant Steps**: Multiple tasks include the same implementation steps

### Analysis Approach
1. Compare task titles for similarity
2. Compare acceptance criteria across all tasks
3. Identify tasks targeting the same files/modules
4. Look for tasks that both address the same spec requirement
5. Check for tasks with similar test cases

### Duplication Indicators
- >70% similarity in acceptance criteria = likely duplicate
- Same spec section referenced by multiple tasks = potential overlap
- Identical file paths in multiple tasks = needs review
- Same API endpoint modified by multiple tasks = potential conflict

${buildDecomposeSeveritySection({
  critical: "Exact duplicate tasks that should be removed",
  warning: "Significant overlap that should be merged or clarified",
  info: "Minor overlap that could be better organized",
})}

${buildDecomposeOutputFormat("duplicate_detection", "duplication")}

${buildDecomposeVerdictGuidelines({
  pass: "No duplicate or significantly overlapping tasks found",
  fail: "Duplicate or overlapping tasks detected that need resolution",
})}

`;

// =============================================================================
// TYPE-SPECIFIC REVIEW PROMPTS
// Different spec types require different review focus
// =============================================================================

/**
 * TECH_SPEC_COMPLETENESS_PROMPT - For technical specifications (how to implement)
 */
export const TECH_SPEC_COMPLETENESS_PROMPT = `You are analyzing a TECHNICAL SPECIFICATION document. Tech specs describe HOW to implement a feature, focusing on architecture, APIs, data models, and implementation details.

${buildContextHeader()}

## RULES FOR EVALUATION

### Technical Completeness Checklist
1. **API Design**: Endpoints, methods, request/response schemas, error codes
2. **Data Models**: Entity definitions, relationships, database schema changes
3. **Component Architecture**: How components interact, data flow, dependencies
4. **Integration Points**: External services, webhooks, third-party APIs
5. **Error Handling**: How errors are caught, logged, and communicated to users
6. **Security Considerations**: Authentication, authorization, data validation

### Implementation Readiness
1. **File Paths**: Clear indication of which files to create/modify
2. **Code Examples**: Pseudo-code or examples for complex logic
3. **Testing Strategy**: Unit test approaches, integration test scenarios
4. **Migration Plan**: Database migrations, backwards compatibility
5. **Dependencies**: Libraries, services, or features this depends on

${buildSeveritySection({
  critical: "Missing technical detail that would block implementation",
  warning: "Ambiguity that could lead to incorrect implementation",
  info: "Nice-to-have technical clarification",
})}

${buildStandardOutputFormat("tech_spec_completeness", "technical")}

${buildVerdictGuidelines({
  pass: "Tech spec is implementation-ready with clear technical details",
  fail: "Critical technical gaps that prevent implementation",
  needsImprovement: "Some technical details need clarification",
})}
${FACTUAL_CLAIMS_WARNING}

`;


/**
 * Tech Spec Implementation Review (FR3)
 * Evaluates feasibility, missing details, unclear dependencies, technology mismatches
 */
const TECH_SPEC_IMPLEMENTATION_PROMPT = `You are reviewing a technical specification for implementation feasibility.

${buildContextHeader()}

## RULES FOR EVALUATION

### Feasibility Assessment
1. **Technical Approach**: Is the proposed architecture sound and achievable?
2. **Dependency Analysis**: Are all dependencies identified and available?
3. **Resource Requirements**: Are compute, storage, and network needs realistic?
4. **Timeline Implications**: Does complexity match expected effort?
5. **Team Capability**: Does approach align with likely team skills?

### Missing Implementation Details
1. **Entry Points**: Where does execution start? Clear initialization?
2. **Data Flow**: How does data move between components?
3. **State Management**: How is state tracked and persisted?
4. **Configuration**: What needs to be configurable?
5. **Deployment Steps**: How is this deployed and rolled back?

### Dependency Analysis
1. **Internal Dependencies**: Other modules/features this depends on
2. **External Dependencies**: Third-party libraries, APIs, services
3. **Circular Dependencies**: Components that depend on each other
4. **Version Constraints**: Specific versions required

### Technology Mismatch Detection
1. **Existing Patterns**: Does approach match codebase conventions?
2. **Language Features**: Uses features compatible with target runtime?
3. **Framework Alignment**: Works with existing frameworks?
4. **Infrastructure Fit**: Compatible with deployment environment?

${buildSeveritySection({
  critical: "Approach is infeasible or has blocking technical issues",
  warning: "Missing details that could cause implementation delays",
  info: "Suggestions for clearer implementation guidance",
})}

${buildStandardOutputFormat("implementation", "feasibility")}

${buildVerdictGuidelines({
  pass: "Implementation approach is feasible with clear technical path",
  fail: "Critical feasibility issues that must be resolved first",
  needsImprovement: "Some implementation details need clarification",
})}

`;

/**
 * Tech Spec Security Review (FR5)
 * Evaluates OWASP Top 10, auth/authz, data exposure, input validation
 */
const TECH_SPEC_SECURITY_PROMPT = `You are a security expert reviewing a technical specification for security vulnerabilities.

${buildContextHeader()}

## RULES FOR EVALUATION

### OWASP Top 10 Analysis
1. **Injection**: SQL, NoSQL, OS, LDAP injection vulnerabilities
2. **Broken Authentication**: Session management, credential exposure
3. **Sensitive Data Exposure**: Data in transit/rest, encryption needs
4. **XML External Entities (XXE)**: XML parsing vulnerabilities
5. **Broken Access Control**: Authorization bypass, privilege escalation
6. **Security Misconfiguration**: Default configs, error exposure
7. **Cross-Site Scripting (XSS)**: Reflected, stored, DOM-based XSS
8. **Insecure Deserialization**: Untrusted data deserialization
9. **Using Components with Known Vulnerabilities**: Outdated dependencies
10. **Insufficient Logging**: Missing audit trails, monitoring gaps

### Authentication & Authorization
1. **Auth Method**: Is authentication mechanism specified and secure?
2. **Session Management**: Token expiry, refresh, invalidation
3. **Permission Model**: RBAC/ABAC defined? Least privilege?
4. **API Security**: API keys, OAuth, JWT validation
5. **Multi-tenancy**: Data isolation between tenants?

### Data Protection
1. **PII Handling**: Personal data identified and protected?
2. **Encryption**: Data encrypted at rest and in transit?
3. **Secret Management**: API keys, passwords stored securely?
4. **Data Retention**: Retention/deletion policies defined?
5. **Audit Logging**: Security events logged?

### Input Validation
1. **Validation Rules**: Input constraints defined?
2. **Sanitization**: Output encoding for XSS prevention?
3. **File Upload**: Type/size restrictions on uploads?
4. **Rate Limiting**: Abuse prevention measures?

${buildSeveritySection({
  critical: "Exploitable vulnerability or missing critical security control",
  warning: "Security best practice not followed or unclear",
  info: "Suggestion to enhance security posture",
})}

${buildStandardOutputFormat("security", "security")}

${buildVerdictGuidelines({
  pass: "Security controls adequate for the feature scope",
  fail: "Critical security vulnerabilities must be addressed",
  needsImprovement: "Some security aspects need clarification",
})}

`;

/**
 * Tech Spec Scalability Review (FR6)
 * Evaluates N+1 queries, caching, blocking operations, resource contention, horizontal scaling
 */
const TECH_SPEC_SCALABILITY_PROMPT = `You are reviewing a technical specification for scalability concerns.

${buildContextHeader()}

## RULES FOR EVALUATION

### Database Scalability
1. **N+1 Queries**: Loops that make individual DB calls? Batch loading?
2. **Query Optimization**: Indexes defined for common queries?
3. **Data Volume**: How does performance change at 10x, 100x data?
4. **Connection Pooling**: Database connection management?
5. **Pagination**: Large result sets paginated?

### Caching Strategy
1. **Cache Opportunities**: Frequently accessed, rarely changed data?
2. **Cache Invalidation**: How/when is cached data refreshed?
3. **Cache Location**: Where caching happens (client, CDN, app, DB)?
4. **Cache Size**: Bounded cache growth?
5. **Cold Start**: Behavior when cache is empty?

### Blocking Operations
1. **Sync vs Async**: Long operations in request path?
2. **Background Jobs**: Heavy work offloaded to queues?
3. **Timeouts**: Operations have timeout limits?
4. **Circuit Breakers**: Failure isolation for external calls?
5. **Retry Strategy**: Exponential backoff defined?

### Resource Contention
1. **Locking**: Database/file locks held too long?
2. **Shared Resources**: Multiple components competing for resources?
3. **Connection Limits**: External API rate limits handled?
4. **Memory Usage**: Unbounded data structures?
5. **CPU-Intensive**: Heavy computation blocking others?

### Horizontal Scaling
1. **Stateless Design**: Can instances run independently?
2. **Session Affinity**: Sticky sessions required or avoided?
3. **Distributed State**: How is shared state coordinated?
4. **Load Balancing**: Strategy specified?
5. **Data Partitioning**: Sharding approach if needed?

${buildSeveritySection({
  critical: "Design prevents scaling or has performance blocker",
  warning: "Potential bottleneck under load",
  info: "Optimization opportunity for better scaling",
})}

${buildStandardOutputFormat("scalability", "scalability")}

${buildVerdictGuidelines({
  pass: "Design scales appropriately for expected load",
  fail: "Critical scalability issues that block production use",
  needsImprovement: "Some scalability aspects need attention",
})}

`;

/**
 * Tech Spec DRY/YAGNI Review (FR7)
 * Evaluates code duplication, over-engineering, premature abstraction, unused flexibility
 */
const TECH_SPEC_DRY_YAGNI_PROMPT = `You are reviewing a technical specification for over-engineering and code quality principles.

${buildContextHeader()}

## RULES FOR EVALUATION

### DRY (Don't Repeat Yourself)
1. **Duplicated Logic**: Same logic defined in multiple places?
2. **Copy-Paste Patterns**: Similar code blocks that could be unified?
3. **Shared Libraries**: Reusable code extracted appropriately?
4. **Configuration Duplication**: Same config defined multiple times?
5. **Schema Duplication**: Same data structure defined redundantly?

### YAGNI (You Aren't Gonna Need It)
1. **Speculative Features**: Building for unconfirmed future needs?
2. **Over-Configurable**: Configuration options nobody will use?
3. **Premature Optimization**: Optimizing before measuring?
4. **Plugin Architecture**: Extensibility for a single use case?
5. **Feature Flags**: Unused flexibility mechanisms?

### Abstraction Level
1. **Premature Abstraction**: Generalizing before patterns emerge?
2. **Wrong Abstraction**: Forcing unrelated things into common interface?
3. **Leaky Abstraction**: Implementation details bleeding through?
4. **Missing Abstraction**: Related concepts not grouped together?
5. **Inheritance vs Composition**: Appropriate relationship choice?

### Complexity vs Value
1. **Accidental Complexity**: Complexity not justified by requirements?
2. **Essential Complexity**: Necessary complexity for the problem?
3. **Gold Plating**: Features beyond stated requirements?
4. **Framework Overhead**: Heavy frameworks for simple problems?
5. **Maintenance Cost**: Future cost of design decisions?

### Reusability Assessment
1. **Appropriate Reuse**: Reusing existing components where possible?
2. **Over-Generalization**: Making things reusable when only used once?
3. **Interface Design**: Clean boundaries for future reuse?
4. **Coupling**: Tight coupling preventing independent evolution?
5. **Cohesion**: Related functionality grouped together?

${buildSeveritySection({
  critical: "Significant over-engineering that adds maintenance burden",
  warning: "Unnecessary complexity or speculative design",
  info: "Opportunity to simplify or improve code organization",
})}

${buildStandardOutputFormat("dry_yagni", "quality")}

${buildVerdictGuidelines({
  pass: "Appropriate complexity for requirements, good code organization",
  fail: "Over-engineering that must be simplified before implementation",
  needsImprovement: "Some areas could be simplified",
})}

`;

/**
 * API_CONTRACT_PROMPT - Validates API contracts in tech specs
 */
export const API_CONTRACT_PROMPT = `You are analyzing a technical specification's API contracts. Your goal is to ensure API definitions are complete, consistent, and follow best practices.

${buildContextHeader()}

## RULES FOR EVALUATION

### API Contract Requirements
1. **Endpoint Definition**: HTTP method, path, path parameters, query parameters
2. **Request Schema**: Required/optional fields, data types, validation rules
3. **Response Schema**: Success response shape, field types, pagination if applicable
4. **Error Responses**: HTTP status codes, error response format, error codes
5. **Authentication**: Auth requirements for each endpoint

### REST Best Practices
1. **HTTP Methods**: GET for reads, POST for creates, PUT/PATCH for updates, DELETE for removals
2. **URL Structure**: Resource-oriented URLs, proper nesting, consistent naming
3. **Status Codes**: Appropriate codes (200, 201, 400, 401, 403, 404, 500)
4. **Idempotency**: PUT/DELETE should be idempotent
5. **Versioning**: API version strategy if applicable

### Common Issues
1. **Missing error cases**: Not defining what happens on validation failure
2. **Inconsistent naming**: camelCase vs snake_case mixing
3. **Missing pagination**: List endpoints without pagination strategy
4. **Incomplete schemas**: Fields referenced but not defined

${buildSeveritySection({
  critical:
    "API contract issue that would cause runtime errors or security issues",
  warning: "API inconsistency that could confuse consumers",
  info: "API design improvement suggestion",
})}

${buildStandardOutputFormat("api_contract", "api")}

${buildVerdictGuidelines({
  pass: "API contracts are complete and well-designed",
  fail: "Critical API issues that must be fixed",
  needsImprovement: "Some API details need refinement",
})}

`;

/**
 * BUG_REPORT_COMPLETENESS_PROMPT - For bug reports
 */
export const BUG_REPORT_COMPLETENESS_PROMPT = `You are analyzing a BUG REPORT. Bug reports describe what's broken and need to provide enough information to reproduce, diagnose, and fix the issue.

${buildContextHeader()}

## RULES FOR EVALUATION

### Bug Report Essentials
1. **Summary**: Clear, concise description of the bug
2. **Reproduction Steps**: Numbered steps to consistently reproduce the issue
3. **Expected Behavior**: What SHOULD happen
4. **Actual Behavior**: What ACTUALLY happens
5. **Environment**: Browser, OS, version, or other relevant context
6. **Evidence**: Screenshots, error messages, logs, stack traces

### Root Cause Analysis
1. **Affected Components**: Which parts of the system are involved
2. **Trigger Conditions**: What specific conditions cause the bug
3. **Impact Assessment**: Who is affected and how severely
4. **Related Issues**: Similar bugs or potential side effects

### Fix Requirements
1. **Acceptance Criteria**: How to verify the bug is fixed
2. **Regression Prevention**: Test cases to add
3. **Scope Boundaries**: What is NOT being fixed (avoiding scope creep)

${buildSeveritySection({
  critical:
    "Missing information that prevents understanding or reproducing the bug",
  warning: "Missing detail that could lead to incomplete fix",
  info: "Additional context that would help investigation",
})}

${buildStandardOutputFormat("bug_report_completeness", "bug")}

${buildVerdictGuidelines({
  pass: "Bug report is complete and actionable",
  fail: "Missing critical information to reproduce or fix the bug",
  needsImprovement: "Some details need clarification for effective fixing",
})}

`;

/**
 * BUG_REPRODUCTION_PROMPT - Validates bug reproduction steps
 */
export const BUG_REPRODUCTION_PROMPT = `You are analyzing a bug report's reproduction steps. Your goal is to ensure the steps are clear, complete, and reliably reproduce the issue.

${buildContextHeader()}

## RULES FOR EVALUATION

### Reproduction Step Quality
1. **Numbered Steps**: Each action is a separate, numbered step
2. **Preconditions**: Clear starting state (logged in? specific page? test data?)
3. **Specific Actions**: "Click the submit button" not "submit the form"
4. **Observable Checkpoints**: How to verify each step worked
5. **Consistent Reproduction**: Steps should reproduce 100% of the time

### Common Issues
1. **Missing setup**: Need test data or configuration not mentioned
2. **Assumed knowledge**: Steps assume familiarity with the system
3. **Timing issues**: Race conditions or delays not mentioned
4. **Environment differences**: Works in dev but not production

### Evidence Validation
1. **Screenshots/Videos**: Match the described steps
2. **Error Messages**: Exact error text included
3. **Console Logs**: Relevant errors captured
4. **Network Requests**: Failing requests identified

${buildSeveritySection({
  critical: "Cannot reproduce the bug with given steps",
  warning: "Steps are unclear or may not reliably reproduce",
  info: "Additional detail would help reproduction",
})}

${buildStandardOutputFormat("bug_reproduction", "reproduction")}

${buildVerdictGuidelines({
  pass: "Reproduction steps are clear and complete",
  fail: "Cannot reliably reproduce the bug from given steps",
  needsImprovement: "Steps need more detail or clarification",
})}

`;

// =============================================================================
// TYPE-SPECIFIC PROMPT SETS
// Export prompt arrays for each spec type
// =============================================================================

import type { SpecType } from "../types/index.js";

interface PromptDefinition {
  name: string;
  category: string;
  template: string;
}

/** Prompts for PRD review (default, existing prompts) */
export const PRD_REVIEW_PROMPTS: PromptDefinition[] = [
  {
    name: "god_spec_detection",
    category: "scope",
    template: GOD_SPEC_DETECTION_PROMPT,
  },
  {
    name: "requirements_completeness",
    category: "completeness",
    template: REQUIREMENTS_COMPLETENESS_PROMPT,
  },
  {
    name: "clarity_specificity",
    category: "clarity",
    template: CLARITY_SPECIFICITY_PROMPT,
  },
  {
    name: "testability",
    category: "testability",
    template: TESTABILITY_PROMPT,
  },
  {
    name: "scope_validation",
    category: "scope_alignment",
    template: SCOPE_VALIDATION_PROMPT,
  },
  {
    name: "e2e_flow_analysis",
    category: "flow",
    template: PRD_E2E_FLOW_PROMPT,
  },
  {
    name: "prd_best_practices",
    category: "best_practices",
    template: PRD_BEST_PRACTICES_PROMPT,
  },
];

/** Prompts for Tech Spec review */
export const TECH_SPEC_REVIEW_PROMPTS: PromptDefinition[] = [
  {
    name: "implementation",
    category: "feasibility",
    template: TECH_SPEC_IMPLEMENTATION_PROMPT,
  },
  {
    name: "testability",
    category: "testing",
    template: TESTABILITY_PROMPT,
  },
  {
    name: "security",
    category: "security",
    template: TECH_SPEC_SECURITY_PROMPT,
  },
  {
    name: "scalability",
    category: "performance",
    template: TECH_SPEC_SCALABILITY_PROMPT,
  },
  {
    name: "dry_yagni",
    category: "quality",
    template: TECH_SPEC_DRY_YAGNI_PROMPT,
  },
];;

/** Prompts for Bug report review */
export const BUG_REVIEW_PROMPTS: PromptDefinition[] = [
  {
    name: "bug_report_completeness",
    category: "bug",
    template: BUG_REPORT_COMPLETENESS_PROMPT,
  },
  {
    name: "bug_reproduction",
    category: "reproduction",
    template: BUG_REPRODUCTION_PROMPT,
  },
  {
    name: "clarity_specificity",
    category: "clarity",
    template: CLARITY_SPECIFICITY_PROMPT,
  },
];

// =============================================================================
// USER STORY REVIEW PROMPTS
// Used to review generated user stories against the parent PRD
// =============================================================================

/**
 * STORY_ACCEPTANCE_CRITERIA_PROMPT - Validates acceptance criteria quality
 */
export const STORY_ACCEPTANCE_CRITERIA_PROMPT = `You are reviewing user stories generated from a PRD. Your task is to evaluate the quality of acceptance criteria.

## PARENT PRD
{prdContent}

## USER STORIES TO REVIEW
{stories}

## RULES FOR EVALUATION

### Acceptance Criteria Quality
1. **Specific**: Each criterion describes a concrete, observable outcome
2. **Testable**: Can be verified with a clear pass/fail result
3. **Complete**: No ambiguous terms like "should work properly" or "user-friendly"
4. **Independent**: Each criterion can be tested separately

### Common Issues
1. **Vague criteria**: "System should be fast" → should specify response time
2. **Missing edge cases**: Happy path only, no error handling criteria
3. **Implementation details**: Criteria should describe WHAT, not HOW
4. **Unmeasurable outcomes**: "Good user experience" without metrics

### Severity Guide
- **critical**: Acceptance criteria are missing or completely untestable
- **warning**: Criteria are vague or missing edge cases
- **info**: Minor improvements for clarity

## OUTPUT FORMAT
Return a JSON object:
{
  "analysisName": "acceptance_criteria_validation",
  "category": "criteria",
  "verdict": "pass" | "fail" | "needs_improvement",
  "summary": "Brief assessment of overall criteria quality",
  "suggestions": [
    {
      "storyId": "US-001",
      "type": "criteria_improvement",
      "severity": "critical" | "warning" | "info",
      "message": "What's wrong",
      "suggestion": "How to improve"
    }
  ]
}

Focus on criteria that cannot be tested or verified.`;

/**
 * STORY_COMPLETENESS_PROMPT - Checks if stories cover all PRD requirements
 */
export const STORY_COMPLETENESS_PROMPT = `You are reviewing user stories generated from a PRD. Your task is to verify that all PRD requirements are addressed by the generated stories.

## PARENT PRD
{prdContent}

## USER STORIES TO REVIEW
{stories}

## RULES FOR EVALUATION

### Coverage Check
1. **Every requirement mapped**: Each PRD requirement should trace to at least one story
2. **No orphan requirements**: Requirements mentioned but not covered by any story
3. **No gold-plating**: Stories should not add features beyond the PRD scope
4. **Priority alignment**: High-priority requirements should be in high-priority stories

### Gap Analysis
1. **Functional gaps**: Features mentioned in PRD but no story covers them
2. **Non-functional gaps**: Performance, security, accessibility requirements missed
3. **Integration gaps**: Dependencies or external systems not addressed
4. **Edge case gaps**: Error scenarios, boundary conditions not covered

### Severity Guide
- **critical**: Major PRD requirement has no corresponding story
- **warning**: Requirement partially covered or story is too vague to confirm coverage
- **info**: Minor improvement suggestions

## OUTPUT FORMAT
Return a JSON object:
{
  "analysisName": "story_completeness",
  "category": "completeness",
  "verdict": "pass" | "fail" | "needs_improvement",
  "summary": "Brief assessment of PRD coverage",
  "coveredRequirements": ["list of PRD requirements that ARE covered"],
  "missingRequirements": ["list of PRD requirements NOT covered"],
  "suggestions": [
    {
      "storyId": "new" | "US-001",
      "type": "missing_requirement" | "partial_coverage",
      "severity": "critical" | "warning" | "info",
      "message": "What requirement is missing or incomplete",
      "suggestion": "Suggested story or improvement"
    }
  ]
}

Focus on PRD requirements that have no story coverage.`;

/**
 * STORY_COMPLEXITY_PROMPT - Assesses story complexity and suggests splitting
 */
export const STORY_COMPLEXITY_PROMPT = `You are reviewing user stories generated from a PRD. Your task is to assess if each story is appropriately sized and suggest splitting if needed.

## PARENT PRD
{prdContent}

## USER STORIES TO REVIEW
{stories}

## RULES FOR EVALUATION

### Size Assessment
1. **Single session**: Each story should be completable in one development session (1-4 hours)
2. **Single concern**: Each story should address one user need or feature
3. **Clear scope**: Story boundaries should be unambiguous
4. **Independent**: Stories should be implementable without depending on unfinished stories

### Split Signals
1. **Multiple personas**: Story serves different user types → split by persona
2. **Multiple actions**: Story has "and" in the description → split by action
3. **Complex acceptance criteria**: More than 5-6 criteria → consider splitting
4. **Technical layers**: Story touches UI, API, and DB → consider vertical slicing

### Merge Signals
1. **Trivial stories**: Stories that are too small to be meaningful alone
2. **Tightly coupled**: Stories that cannot be implemented independently
3. **Same feature**: Multiple stories that are naturally one unit of work

### Severity Guide
- **critical**: Story is far too large to implement in reasonable time
- **warning**: Story could benefit from splitting
- **info**: Minor suggestions for story structure

## OUTPUT FORMAT
Return a JSON object:
{
  "analysisName": "story_complexity",
  "category": "complexity",
  "verdict": "pass" | "fail" | "needs_improvement",
  "summary": "Brief assessment of story sizing",
  "suggestions": [
    {
      "storyId": "US-001",
      "type": "split_recommended" | "merge_recommended" | "complexity_concern",
      "severity": "critical" | "warning" | "info",
      "message": "Why this story should be split/merged",
      "suggestion": "How to split/merge"
    }
  ]
}

Focus on stories that are too large or too small.`;

/** Prompts for User Story review (after PRD decomposition) */
export const USER_STORY_REVIEW_PROMPTS: PromptDefinition[] = [
  {
    name: "acceptance_criteria_validation",
    category: "criteria",
    template: STORY_ACCEPTANCE_CRITERIA_PROMPT,
  },
  {
    name: "story_completeness",
    category: "completeness",
    template: STORY_COMPLETENESS_PROMPT,
  },
  {
    name: "story_complexity",
    category: "complexity",
    template: STORY_COMPLEXITY_PROMPT,
  },
];

/**
 * Get prompts for reviewing user stories
 */
export function getUserStoryReviewPrompts(): PromptDefinition[] {
  return USER_STORY_REVIEW_PROMPTS;
}

/**
 * Get the appropriate review prompts for a spec type
 */
export function getReviewPromptsForType(
  specType: SpecType
): PromptDefinition[] {
  switch (specType) {
    case "tech-spec":
      return TECH_SPEC_REVIEW_PROMPTS;
    case "bug":
      return BUG_REVIEW_PROMPTS;
    case "prd":
    default:
      return PRD_REVIEW_PROMPTS;
  }
}

// =============================================================================
// REVIEW AGGREGATION PROMPT
// Final aggregation step that deduplicates and synthesizes all review findings
// =============================================================================

/**
 * REVIEW_AGGREGATION_PROMPT - Synthesizes and deduplicates findings from multiple review prompts
 *
 * This is the final step after all individual review prompts have run.
 * It produces a consolidated, deduplicated set of suggestions.
 */
export const REVIEW_AGGREGATION_PROMPT = `You are a senior technical reviewer performing the final aggregation of a spec review. Multiple specialized review prompts have already analyzed this spec from different angles. Your job is to:

1. **Deduplicate**: Identify suggestions that are essentially the same issue flagged by different prompts
2. **Synthesize**: Combine related findings into coherent, actionable items
3. **Prioritize**: Ensure the most critical issues are surfaced prominently
4. **Contextualize**: Read the actual spec to ensure suggestions make sense in context

## SPEC FILE
Read the spec file to understand the context: {specPath}

## INDIVIDUAL REVIEW RESULTS
The following are the raw results from {promptCount} specialized review prompts:

{reviewResults}

## YOUR TASK

### 1. Identify Duplicates
Look for suggestions that target:
- The same line numbers or text sections
- The same conceptual issue (even if worded differently)
- The same requirement or feature

### 2. Merge Duplicates
When you find duplicates:
- Keep the suggestion with the most actionable fix
- Use the highest severity among duplicates
- Combine category tags (e.g., "completeness, flow, testability")
- Note which prompts flagged it (for transparency)

### 3. Synthesize Related Issues
Some issues may be related but not exact duplicates:
- Group them under a parent issue if they share a root cause
- Or keep them separate if they require different fixes

### 4. Validate Against Spec
Read the spec file and verify:
- Each suggestion is still valid (not already addressed in the spec)
- Line numbers are accurate
- The suggested fixes make sense in context

### 5. Add Executive Summary
Provide a brief (2-3 sentence) summary of the spec's overall quality and the most important issues to address.

## OUTPUT FORMAT
Return a JSON object with this structure:

\`\`\`json
{
  "verdict": "PASS" | "FAIL" | "NEEDS_IMPROVEMENT" | "SPLIT_RECOMMENDED",
  "executiveSummary": "Brief overview of spec quality and key issues",
  "totalIssuesBeforeDedup": number,
  "totalIssuesAfterDedup": number,
  "suggestions": [
    {
      "id": "agg-001",
      "category": "completeness, flow",
      "severity": "critical" | "warning" | "info",
      "type": "change" | "comment",
      "section": "Section name",
      "lineStart": number | null,
      "lineEnd": number | null,
      "textSnippet": "Relevant text from spec",
      "issue": "Clear description of the issue",
      "suggestedFix": "Concrete fix or clarifying question",
      "status": "pending",
      "sourcePrompts": ["prompt1", "prompt2"],
      "mergedFrom": number
    }
  ],
  "categorySummary": {
    "critical": number,
    "warning": number,
    "info": number
  },
  "splitProposal": null | {
    "reason": "Why spec should be split",
    "proposedSpecs": [{"filename": "name.md", "description": "what it covers"}]
  }
}
\`\`\`

### Deduplication Rules
- **Exact match**: Same lineStart/lineEnd AND similar issue text → merge
- **Semantic match**: Different lines but same root cause → merge with note
- **Related but distinct**: Keep separate but group in output

### Severity Escalation
When merging, use the highest severity:
- If any source is "critical" → merged is "critical"
- If any source is "warning" → merged is "warning"
- Otherwise → "info"

Focus on producing a clean, actionable list that a developer can work through without seeing redundant items.`;

/**
 * Builds the aggregation prompt with review results
 */
export function buildAggregationPrompt(
  specPath: string,
  reviewResults: Array<{
    promptName: string;
    verdict: string;
    issues: string[];
    suggestions: unknown[];
  }>,
  promptCount: number
): string {
  const resultsJson = JSON.stringify(reviewResults, null, 2);

  return REVIEW_AGGREGATION_PROMPT.replace("{specPath}", specPath)
    .replace("{promptCount}", String(promptCount))
    .replace("{reviewResults}", resultsJson);
}
