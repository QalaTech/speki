/**
 * Focused prompts for standalone spec review (FR-7)
 * Each prompt has a single responsibility and outputs structured JSON.
 */

// Common instruction appended to all prompts
const CLOSING_INSTRUCTION =
  'Analyze the spec and return ONLY the JSON response, no additional commentary.';

/**
 * Builds the common spec/codebase context header used by all prompts.
 */
function buildContextHeader(): string {
  return `## SPEC CONTENT
{specContent}

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
      "section": "Section name where issue found",
      "lineStart": number | null,
      "lineEnd": number | null,
      "textSnippet": "Relevant text from spec",
      "issue": "Description of the issue",
      "suggestedFix": "Proposed fix or improvement",
      "status": "pending"
    }
  ],
  "durationMs": 0
}
\`\`\``;
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

${CLOSING_INSTRUCTION}`;
