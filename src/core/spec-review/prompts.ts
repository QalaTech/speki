/**
 * Focused prompts for standalone spec review (FR-7)
 * Each prompt has a single responsibility and outputs structured JSON.
 */

// Common instruction appended to all prompts
const CLOSING_INSTRUCTION =
  'Analyze the spec and return ONLY the JSON response, no additional commentary.';

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
function buildStandardOutputFormat(promptName: string, category: string): string {
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
      "status": "pending"
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
- Use \`"type": "comment"\` when asking a clarifying question, noting a general concern, or the issue requires human judgment`;
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

${CLOSING_INSTRUCTION}`;

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
  critical: 'Implementation cannot proceed without this information',
  warning: 'Ambiguity that could lead to incorrect implementation',
  info: 'Nice-to-have clarification that would improve the spec',
})}

${buildStandardOutputFormat('requirements_completeness', 'completeness')}

${buildVerdictGuidelines({
  pass: 'All critical requirements present, minor gaps at most',
  fail: 'Critical requirements missing that block implementation',
  needsImprovement: 'No critical gaps but significant warnings present',
})}
${FACTUAL_CLAIMS_WARNING}

${CLOSING_INSTRUCTION}`;

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
  critical: 'Ambiguity that could result in fundamentally wrong implementation',
  warning: 'Ambiguity that could cause rework or misaligned expectations',
  info: 'Minor clarity improvements that would enhance understanding',
})}

${buildStandardOutputFormat('clarity_specificity', 'clarity')}

${buildVerdictGuidelines({
  pass: 'Spec is clear and specific, minor improvements only',
  fail: 'Critical ambiguities that could cause major misimplementation',
  needsImprovement: 'Several warnings that should be addressed',
})}
${FACTUAL_CLAIMS_WARNING}

${CLOSING_INSTRUCTION}`;

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
  critical: 'Core functionality cannot be verified',
  warning: 'Feature testable but acceptance criteria unclear',
  info: 'Suggestion to add explicit test scenarios',
})}

${buildStandardOutputFormat('testability', 'testability')}

${buildVerdictGuidelines({
  pass: 'All requirements are testable with clear acceptance criteria',
  fail: 'Core requirements cannot be verified',
  needsImprovement: 'Some requirements need clearer success criteria',
})}

${CLOSING_INSTRUCTION}`;

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
  critical: 'Architectural violation or scope that would cause system-wide issues',
  warning: 'Scope concern that should be reconsidered or requires justification',
  info: 'Suggestion for better alignment with existing patterns',
})}

${buildStandardOutputFormat('scope_validation', 'scope')}

${buildVerdictGuidelines({
  pass: 'Scope is well-defined and aligns with codebase architecture',
  fail: 'Scope violates architecture or would cause significant problems',
  needsImprovement: 'Scope needs refinement for better alignment',
})}
${FACTUAL_CLAIMS_WARNING}

${CLOSING_INSTRUCTION}`;


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
function buildDecomposeOutputFormat(promptName: string, category: string): string {
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
  critical: 'Core functionality requirement not covered by any task',
  warning: 'Secondary requirement or edge case missing coverage',
  info: 'Nice-to-have or implicit requirement not explicitly tasked',
})}

${buildDecomposeOutputFormat('missing_requirements', 'coverage')}

${buildDecomposeVerdictGuidelines({
  pass: 'All requirements in spec have corresponding task coverage',
  fail: 'One or more requirements lack task coverage',
})}

${CLOSING_INSTRUCTION}`;

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
  critical: 'Direct contradiction that would cause implementation failure',
  warning: 'Inconsistency that could lead to confusion or rework',
  info: 'Minor discrepancy that should be clarified',
})}

${buildDecomposeOutputFormat('contradictions', 'consistency')}

${buildDecomposeVerdictGuidelines({
  pass: 'No contradictions found between spec and tasks or between tasks',
  fail: 'One or more contradictions detected that need resolution',
})}

${CLOSING_INSTRUCTION}`;

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
  critical: 'Circular dependency or missing critical dependency that blocks execution',
  warning: 'Missing dependency that could cause implementation issues',
  info: 'Unnecessary dependency that could be removed for efficiency',
})}

${buildDecomposeOutputFormat('dependency_validation', 'dependencies')}

${buildDecomposeVerdictGuidelines({
  pass: 'All dependencies are valid and form a correct execution DAG',
  fail: 'Dependency issues found that need correction',
})}

${CLOSING_INSTRUCTION}`;

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
  critical: 'Exact duplicate tasks that should be removed',
  warning: 'Significant overlap that should be merged or clarified',
  info: 'Minor overlap that could be better organized',
})}

${buildDecomposeOutputFormat('duplicate_detection', 'duplication')}

${buildDecomposeVerdictGuidelines({
  pass: 'No duplicate or significantly overlapping tasks found',
  fail: 'Duplicate or overlapping tasks detected that need resolution',
})}

${CLOSING_INSTRUCTION}`;
