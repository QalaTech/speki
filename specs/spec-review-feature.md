# Spec Review Feature

> **Purpose**: Help users create **perfect PRDs** that can be deterministically decomposed into executable tasks. Poor PRDs lead to poor products. This feature validates specs against the golden standard (`.ralph/standards/`) and provides interactive, AI-assisted improvements to achieve 100% accuracy in task execution.

---

## 1. Problem Statement (Observable & Verifiable)

Users currently have no way to validate their specification documents against quality standards before or after decomposition.

This results in:
- Specs that fail peer review after decomposition (wasted compute and time)
- Inconsistent spec quality across projects
- Manual review effort that could be automated
- No standalone way to review specs outside of the decomposition workflow

---

## 2. Goals (Measurable Outcomes)

- Enable standalone spec validation via `qala spec review` command
- Enable integrated spec validation during decomposition via `--review` flag
- Reduce failed peer reviews by catching issues earlier (measurable via review pass rate)
- Provide configurable timeout and CLI selection for flexibility
- Improve review reliability through focused, single-purpose prompts

---

## 3. Non-Goals (Explicit Exclusions)

- No **automatic** spec editing without user approval (all changes require explicit user action)
- No batch review of multiple specs simultaneously
- No spec version history or diff tracking (beyond session-level change history)
- No integration with external document systems (Google Docs, Notion, etc.)
- No custom golden standard templates per project in v1 (uses `.ralph/standards/`)
- No interactive chat mode for the CLI command (dashboard-only feature)

Note: User-approved edits via [Approve] in diff view ARE in scope. The agent proposes, user approves.

---

## 4. User Personas

```
Persona:
- Role: Developer/Product Manager writing specs
- Primary Goal: Validate spec quality before/after decomposition
- Key Friction: Uncertain if spec meets quality standards
```

---

## 5. System Boundary (Hard Box)

The system is responsible for:
- CLI command `qala spec review <file>` for standalone spec review
- Integration with `qala decompose --review` for post-decomposition validation
- Spawning review agent **with full tool access** (file read, grep, glob, codebase exploration)
- Validating spec against existing codebase patterns and architecture
- Detecting "god specs" that are too large/ambitious and offering to split them
- Generating split spec proposals with naming convention `{basename}.{feature}.md`
- Configurable timeout via `RALPH_REVIEW_TIMEOUT_MS` environment variable
- Focused sub-prompts for reliable review (one concern per prompt)
- Displaying review results with actionable feedback
- Logging all review attempts for debugging

The system is NOT responsible for:
- Editing the spec file directly (but CAN create new split spec files with user approval)
- Interactive chat (CLI version - dashboard may add this later)
- Training or fine-tuning models
- Managing golden standard templates

### Agent Tool Access (Important Distinction)

**Spec Review Agent (`qala spec review`) - WITH TOOLS:**

The spec review agent MUST have access to its normal tools to:
- Read existing source files to understand current architecture
- Search codebase for existing patterns, conventions, and implementations
- Validate that spec requirements align with codebase structure
- Identify if features described already exist or conflict with existing code
- Assess implementation complexity based on actual codebase state
- Detect god specs by understanding what the spec would touch

**Do NOT disable tools for spec review** - the agent needs codebase context to provide meaningful review.

**Task Review Agent (`qala decompose --review`) - WITHOUT TOOLS:**

The task/decompose review agent should run WITHOUT tools because:
- It's pure document comparison (spec vs generated tasks)
- No need to read codebase - just validating task coverage
- Faster execution without tool overhead
- Existing behavior preserved (backwards compatible)

This agent continues to use `--tools ''` flag as before.

---

## 6. User Flows (Step-by-Step)

### Flow 1: Standalone Spec Review (CLI)

1. User runs `qala spec review <spec-file.md>` or `qala spec review` (prompts for file)
2. System validates the file exists and is a markdown file
3. System loads golden standard from `.ralph/standards/`:
   - `golden_standard_prd_deterministic_decomposable.md` - Full standard
   - `prd_writing_rules_absolute_tldr.md` - TL;DR validation rules
4. System spawns Claude CLI (default) or Codex **with full tool access enabled**
5. Agent explores the codebase to understand:
   - Current architecture and patterns
   - Existing implementations that may overlap with spec
   - Technology stack and conventions in use
6. System runs focused sub-prompts sequentially:
   - **God spec detection** (is this too large? should it be split?)
   - Requirements completeness check
   - Clarity and specificity check
   - Testability check
   - Scope validation check (against actual codebase)
7. If god spec detected:
   - System proposes split into smaller end-to-end specs
   - User can accept, modify, or reject the split
   - If accepted, system creates new spec files
8. System aggregates results and displays:
   - Overall verdict: PASS, FAIL, NEEDS_IMPROVEMENT, or **SPLIT_RECOMMENDED**
   - Per-category results with specific issues
   - Actionable suggestions for improvement
9. System saves review log to `.ralph/logs/spec_review_<timestamp>.log`

### Flow 2: God Spec Detection and Splitting

1. During review, agent analyzes spec for "god spec" indicators:
   - Multiple unrelated feature domains in single spec
   - Spec covers more than one end-to-end user journey
   - Estimated task count would exceed 15-20 user stories
   - Spec touches multiple major system boundaries

2. **If god spec detected, agent MUST inform the user first:**
   - Clearly states this is a "god spec"
   - Explains WHY it's problematic (too large, multiple domains, etc.)
   - Lists the specific indicators found
   - **Recommends splitting before proceeding with decomposition**

3. Agent proposes a split:
   - Identifies logical feature/phase boundaries
   - Suggests new spec files with naming: `{original-basename}.{feature}.md`
   - Example: `user-management.md` → `user-management.registration.md`, `user-management.authentication.md`, `user-management.profile.md`
   - Estimates story count for each proposed spec

4. System displays recommendation and **waits for user decision** (no automatic action):
   ```
   ⚠️  God Spec Detected

   This spec appears to be a "god spec" covering multiple independent features.

   Why this is problematic:
     - Estimated 25+ user stories (recommended: 5-15 per spec)
     - 5 unrelated feature domains identified
     - No single "definition of done" possible

   Recommendation: Split this spec into smaller, end-to-end specs before decomposition.

   Proposed split:
     1. user-management.registration.md - User signup and email verification (5-7 stories)
     2. user-management.authentication.md - Login, logout, session management (6-8 stories)
     3. user-management.profile.md - Profile editing, avatar, preferences (4-6 stories)

   ? How would you like to proceed?
     > Accept - Create split spec files (recommended)
       Modify - Edit the proposed split
       Skip - Continue with current spec (not recommended)
   ```

5. **No automatic splitting** - user must explicitly choose:
   - **Accept**: Opens preview of all proposed files before saving
   - **Modify**: User can edit proposed content in preview before saving
   - **Skip**: Continue review with warning (not recommended)

6. If user clicks Accept or Modify:
   - System shows preview of ALL proposed split files
   - User can review/edit each file's content before saving
   - User clicks [Save All] to write files to disk
   - This prevents accidental overwrites

7. If user confirms save:
   - System creates new spec files with proposed content structure
   - Original spec is preserved (not deleted)
   - Each new spec is self-contained and end-to-end

7. User can then review/decompose each smaller spec independently

### Flow 3: Integrated Decompose Review

1. User runs `qala decompose <spec-file.md> --review`
2. System decomposes spec into tasks (existing flow)
3. System automatically triggers peer review of tasks against original spec
4. Agent runs **without tools** (pure document comparison - spec vs tasks)
5. System runs focused sub-prompts:
   - Missing requirements check
   - Task-to-spec contradiction check
   - Dependency validation check
   - Duplicate detection check
6. If FAIL verdict:
   - System sends feedback to Claude for automatic revision
   - Retries review up to `RALPH_MAX_REVIEW_ATTEMPTS` times (default: 3)
7. System displays final verdict and saves output

Note: This differs from `qala spec review` which uses tools. Task review is purely comparing documents.

### Flow 4: Dashboard Spec Review (Interactive UI)

**Editor Component: [MDXEditor](https://mdxeditor.dev/)**

Using MDXEditor (built on Lexical) for the spec preview/editor. This provides:
- WYSIWYG markdown editing with live preview
- Rich text formatting toolbar
- Code blocks with syntax highlighting
- Table editing
- Diff/source view toggle

**Layout: Split View**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Spec Review: user-management.md                              [x]  │
├────────────────────────────────┬────────────────────────────────────┤
│                                │                                    │
│  SPEC EDITOR (MDXEditor)       │  REVIEW & CHAT                     │
│                                │                                    │
│  # User Management             │  ⚠️ God Spec Detected              │
│                                │                                    │
│  ## 1. Problem Statement       │  This spec covers 5 feature        │
│  Users need to...              │  domains. Recommend splitting.     │
│                                │                                    │
│  ## 2. Goals                   │  [Accept Split] [Modify] [Skip]    │
│  - Enable user registration    │                                    │
│  - Provide authentication      │  ─────────────────────────────     │
│  ...                           │                                    │
│  ┌─────────────────────────┐   │  Suggestions:                      │
│  │ ██ HIGHLIGHTED SECTION ██│  │                                    │
│  │ "The system should be   │◄──│  1. Section 2.1: "fast" is vague   │
│  │  fast" - vague criteria │   │     [Apply Fix] [Dismiss] [Show]   │
│  └─────────────────────────┘   │                                    │
│                                │  2. Section 4.2: Missing test      │
│  ## 3. User Flows              │     criteria                       │
│  ...                           │     [Apply Fix] [Dismiss] [Show]   │
│                                │                                    │
│  [Click suggestion to scroll   │  ─────────────────────────────     │
│   and highlight in editor]     │                                    │
│                                │  💬 Chat with reviewer             │
│                                │  ┌──────────────────────────────┐  │
│                                │  │ Type a message...            │  │
│                                │  └──────────────────────────────┘  │
└────────────────────────────────┴────────────────────────────────────┘
```

**Interactive Editor Features:**
- **Scroll to section**: Clicking [Show in Editor] scrolls to relevant section
- **Highlight text**: Agent can highlight specific text it's referencing
- **Line references**: Suggestions include line numbers/section refs
- **Live editing**: User can edit spec directly; agent can also make changes
- **Selection sync**: When user selects text in editor, can ask "what about this?"
- **Diff view**: [Review Diff] shows side-by-side current vs proposed changes

**Diff View Mode:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Spec Review: user-management.md                    [Exit Diff]    │
├────────────────────────────────┬────────────────────────────────────┤
│                                │                                    │
│  DIFF VIEW                     │  Suggestion: Clarity Issue         │
│                                │                                    │
│  ┌─────────────┬─────────────┐ │  "fast" is vague - needs           │
│  │  CURRENT    │  PROPOSED   │ │  measurable criteria               │
│  ├─────────────┼─────────────┤ │                                    │
│  │ The system  │ The system  │ │  Section: ## 2. Goals              │
│  │ should be   │ should      │ │  Lines: 45-46                      │
│  │ -fast       │ +respond in │ │                                    │
│  │             │ +< 200ms    │ │  ─────────────────────────────     │
│  │             │ +(p95)      │ │                                    │
│  └─────────────┴─────────────┘ │  [Approve] [Reject] [Edit]         │
│                                │                                    │
│  [You can edit the proposed    │  Suggestion 1 of 5                 │
│   side before approving]       │  [◀ Previous] [Next ▶]             │
│                                │                                    │
└────────────────────────────────┴────────────────────────────────────┘
```

**Flow:**

1. User navigates to "Spec Review" menu item in sidebar
2. System displays file selection dropdown with markdown files from specs/, docs/, .ralph/specs/
3. User selects a spec file
4. **Split view opens**: Spec preview (left) | Review panel (right)
5. User clicks "Start Review"
6. Agent runs review with full tool access
7. **Results appear as interactive cards** in right panel:
   - Each suggestion has [Apply Fix] [Dismiss] buttons
   - God spec warning has [Accept Split] [Modify] [Skip] buttons
   - User can approve/reject each recommendation individually
8. **When user approves a suggestion**:
   - Agent modifies the spec file
   - Left panel updates live to show changes
   - Change is highlighted briefly
9. **Chat interface** at bottom of right panel for follow-up:
   - User can ask questions about suggestions
   - User can request custom changes ("make section 3 more specific")
   - Agent responds and can propose additional fixes
10. All changes are tracked and can be reverted

**Key Principles:**
- **Everything is interactive** - no static text walls
- **Agent makes changes** - user approves, agent executes
- **Live preview** - spec updates in real-time as changes are approved
- **Conversational** - user can ask for clarifications or custom changes

---

## 7. Functional Requirements (Executable Logic)

### FR-1: CLI Command Registration

```
Given the user has qala installed
When the user runs `qala spec review --help`
Then the system displays:
  Usage: qala spec review [file] [options]

  Options:
    --timeout <ms>   Review timeout in milliseconds (default: env RALPH_REVIEW_TIMEOUT_MS or 600000)
    --cli <type>     CLI to use: claude (default) or codex
    --verbose        Show detailed progress output
    --json           Output results as JSON
    -h, --help       Display help
```

### FR-2: File Selection (Interactive)

```
Given the user runs `qala spec review` without a file argument
When the command executes
Then the system searches for markdown files in specs/, docs/, .ralph/specs/, and current directory
And displays an interactive file picker with found files
And proceeds with the selected file
```

### FR-3: File Validation

```
Given the user runs `qala spec review <file>`
When the file path is provided
Then the system validates the file exists
And the file has a .md extension
And the file is readable
And if validation fails, displays specific error message
```

### FR-4: CLI Selection (Claude Default)

```
Given the user runs `qala spec review <file>`
When initiating the review
Then the system reads ~/.qala/config.json reviewer.cli setting
And if reviewer.cli is "claude" or undefined, spawns Claude CLI
And if reviewer.cli is "codex", spawns Codex CLI
And if --cli flag is provided, overrides the config setting
```

### FR-4a: Agent Tool Access

```
Given the review agent is being spawned
When configuring the agent
Then the agent MUST have access to file reading tools (Read, Glob, Grep)
And the agent MUST be able to explore the codebase directory structure
And the agent MUST NOT have tools disabled (no --tools '' flag)
And the agent working directory is set to the project root

Note: This differs from decompose peer review which historically disabled tools.
The spec review agent needs codebase context to provide meaningful feedback.
```

### FR-4b: Codebase Context Gathering

```
Given the review agent has started
When beginning the review process
Then the agent first explores the codebase to understand:
  - Project structure (directories, key files)
  - Technology stack (package.json, config files, etc.)
  - Existing patterns (how similar features are implemented)
  - Relevant existing code that the spec may affect
And uses this context to inform all subsequent review prompts
```

### FR-5: Configurable Timeout

```
Given the review agent is running
When the timeout period elapses
Then the system terminates the agent process gracefully (SIGTERM, then SIGKILL after 5s)

Timeout priority (highest to lowest):
1. --timeout <ms> command line flag
2. RALPH_REVIEW_TIMEOUT_MS environment variable
3. Default: 600000ms (10 minutes)

Valid range: 30000ms (30 seconds) to 1800000ms (30 minutes)
```

### FR-6: Focused Sub-Prompts (Decompose Review)

```
Given the system is reviewing decomposed tasks against a spec
When the review executes
Then the system runs 4 focused prompts sequentially:

Prompt 1: Missing Requirements
- Input: Spec document + Tasks JSON
- Output: List of spec requirements not covered by any task
- Verdict contribution: FAIL if any missing

Prompt 2: Contradictions
- Input: Spec document + Tasks JSON
- Output: List of tasks that contradict spec requirements
- Verdict contribution: FAIL if any contradictions

Prompt 3: Dependency Validation
- Input: Tasks JSON only
- Output: List of invalid dependencies (references to non-existent tasks)
- Verdict contribution: FAIL if any invalid dependencies

Prompt 4: Duplicate Detection
- Input: Tasks JSON only
- Output: List of task pairs/groups that duplicate functionality
- Verdict contribution: FAIL if significant duplicates
```

### FR-7: Focused Sub-Prompts (Standalone Spec Review)

```
Given the system is reviewing a standalone spec
When the review executes
Then the system runs 5 focused prompts sequentially:

Prompt 0: God Spec Detection (runs first)
- Input: Spec document + Codebase context
- Output: Assessment of spec size/scope, split recommendation if needed
- Verdict contribution: SPLIT_RECOMMENDED if god spec detected
- If split recommended, remaining prompts still run but verdict is SPLIT_RECOMMENDED

Prompt 1: Requirements Completeness
- Input: Spec document + Golden standard rules + Codebase context
- Output: List of missing required sections/elements
- Verdict contribution: FAIL if critical sections missing

Prompt 2: Clarity and Specificity
- Input: Spec document + Golden standard rules
- Output: List of vague or ambiguous requirements
- Verdict contribution: NEEDS_IMPROVEMENT if issues found

Prompt 3: Testability
- Input: Spec document + Golden standard rules
- Output: List of requirements that cannot be objectively verified
- Verdict contribution: NEEDS_IMPROVEMENT if issues found

Prompt 4: Scope Validation
- Input: Spec document + Golden standard rules + Codebase context
- Output: Assessment of scope creep, vision statements, or unbuildable features
- Also checks: Does this spec conflict with existing implementations?
- Verdict contribution: FAIL if scope issues found
```

### FR-7a: God Spec Detection Criteria

```
Given the agent is evaluating if a spec is a "god spec"
When analyzing the spec
Then the agent checks for these indicators:

Size indicators:
- Spec has more than 3 major feature sections
- Estimated decomposition would yield > 15-20 user stories
- Spec document exceeds 2000 words of requirements

Scope indicators:
- Multiple unrelated user journeys in single spec
- Features that could be independently released
- Spec touches > 3 major system boundaries (e.g., auth, payments, notifications)
- Mix of infrastructure and user-facing features

Cohesion indicators:
- No clear single "definition of done" for the spec
- Features have different target users or personas
- Dependencies between sections are weak or non-existent

If 2+ indicators are present, recommend split.
```

### FR-7b: Split Proposal Generation

```
Given a god spec has been detected
When generating a split proposal
Then the agent:
  1. Identifies logical feature boundaries
  2. Groups related requirements into coherent specs
  3. Ensures each proposed spec is:
     - Self-contained (can be implemented independently)
     - End-to-end (delivers user value on its own)
     - Right-sized (estimated 5-15 user stories)
  4. Generates file names using pattern: {original-basename}.{feature-name}.md
  5. Provides brief description of each proposed spec's scope
```

### FR-7c: Split File Naming Convention

```
Given a spec file needs to be split
When generating new file names
Then the system uses this pattern:
  {original-file-name-without-extension}.{feature-or-phase}.{extension}

Examples:
  user-management.md →
    - user-management.registration.md
    - user-management.authentication.md
    - user-management.profile.md

  ecommerce-platform.md →
    - ecommerce-platform.product-catalog.md
    - ecommerce-platform.shopping-cart.md
    - ecommerce-platform.checkout.md
    - ecommerce-platform.order-management.md

  api-v2.md →
    - api-v2.phase1-core-endpoints.md
    - api-v2.phase2-advanced-features.md
    - api-v2.phase3-integrations.md

Rules:
- Feature names are kebab-case
- Feature names are descriptive but concise (1-3 words)
- Phase-based splits include phase number prefix
- All split files are placed in same directory as original
```

### FR-7d: Split Execution

```
Given the user accepts a split proposal
When executing the split
Then the system:
  1. Creates new spec files with proposed names
  2. Populates each with relevant sections from original spec
  3. Adds header to each: "Split from: {original-filename}"
  4. Does NOT delete or modify the original spec
  5. Displays summary of created files
  6. Suggests next steps: "Run `qala spec review <file>` on each new spec"
```

### FR-8: Result Aggregation

```
Given all focused prompts have completed
When aggregating results
Then the system computes overall verdict:
  - SPLIT_RECOMMENDED: God spec detected, split proposed (highest priority)
  - FAIL: Any prompt returned critical failure
  - NEEDS_IMPROVEMENT: Non-critical issues found but no failures
  - PASS: All prompts passed
And combines all issues into categorized output
And provides suggestions prioritized by severity
And if SPLIT_RECOMMENDED, includes the split proposal in output
```

### FR-9: Review Logging

```
Given the review completes (success or failure)
When saving logs
Then the system creates:
  - .ralph/logs/spec_review_<timestamp>.log (human-readable summary)
  - .ralph/logs/spec_review_<timestamp>.prompts/ (directory with each prompt/response)
  - .ralph/logs/spec_review_<timestamp>.json (machine-readable full output)
```

### FR-10: Error Handling - CLI Unavailable

```
Given the selected CLI (claude or codex) is not installed
When the user runs `qala spec review`
Then the system displays: "Claude CLI not found. Install it or use --cli codex"
And provides installation instructions
And exits with code 1
```

### FR-11: Error Handling - Timeout

```
Given the review agent is running
When the configured timeout elapses
Then the system terminates the agent process
And displays: "Review timed out after X seconds. Increase timeout with --timeout or RALPH_REVIEW_TIMEOUT_MS"
And provides the partial results collected so far (if any)
And exits with code 1
```

### FR-12: Decompose Integration

```
Given the user runs `qala decompose <file> --review`
When decomposition completes successfully
Then the system automatically triggers peer review
And uses the same timeout and CLI settings as standalone review
And applies the decompose-specific focused prompts (FR-6)
And on FAIL, attempts automatic revision up to RALPH_MAX_REVIEW_ATTEMPTS times
```

### FR-13: Interactive Dashboard - Split View Layout

```
Given the user opens the Spec Review page in the dashboard
When a spec file is selected
Then the system displays a split view:
  - Left panel: MDXEditor with spec content (editable)
  - Right panel: Review results and chat interface
And the panels are resizable
And the editor supports both WYSIWYG and source/diff modes
```

### FR-13a: MDXEditor Integration

```
Given MDXEditor is used for the spec editor
When the editor is initialized
Then the system configures MDXEditor with:
  - headingsPlugin() for markdown headings
  - listsPlugin() for bullet/numbered lists
  - quotePlugin() for blockquotes
  - codeBlockPlugin() for code blocks with syntax highlighting
  - tablePlugin() for table editing
  - markdownShortcutPlugin() for markdown syntax shortcuts
  - diffSourcePlugin() for viewing raw markdown/diffs
And the editor ref is stored for programmatic access
And onChange handler syncs content to application state
```

### FR-13b: Programmatic Scroll and Highlight

```
Given a suggestion references a specific section/line
When the user clicks [Show] on the suggestion
Then the system:
  1. Parses the section reference (e.g., "Section 2.1", line 45)
  2. Accesses Lexical editor via rootEditor$ cell
  3. Finds the corresponding node in the Lexical AST
  4. Scrolls the editor to bring that node into view
  5. Applies highlight decoration to the relevant text
  6. Highlight fades after 3 seconds or until user interacts

Implementation note: Use Lexical's $getNodeByKey() and node.selectStart()
for selection, and scrollIntoView() for positioning.
```

### FR-13c: Agent Line References

```
Given the agent is generating a suggestion
When referencing a specific part of the spec
Then the agent MUST include:
  - Section heading reference (e.g., "## 2. Goals")
  - Line number range (e.g., "lines 45-52")
  - Exact text snippet being referenced (for matching)

Example agent output:
{
  "section": "## 2. Goals",
  "lineStart": 45,
  "lineEnd": 52,
  "textSnippet": "The system should be fast",
  "issue": "No measurable criteria for 'fast'",
  "suggestedFix": "Replace with: 'Response time < 200ms p95'"
}
```

### FR-13d: Selection-Based Chat

```
Given the user selects text in the MDXEditor
When they type a message in the chat
Then the system:
  1. Captures the selected text from Lexical editor
  2. Includes selection context in the chat message to agent
  3. Agent understands the question is about the selected text

Example:
  User selects: "Users should be able to manage their preferences"
  User types: "Is this specific enough?"
  Agent receives: { selectedText: "...", question: "Is this specific enough?" }
  Agent responds with context-aware feedback about that specific text
```

### FR-13e: Diff-Based Suggestion Review

```
Given the agent proposes a change (suggestion)
When displaying the suggestion to the user
Then the system:
  1. Agent provides: { lineStart, lineEnd, oldText, newText, reason }
  2. System switches MDXEditor to diff view (diffSourcePlugin)
  3. Diff view shows:
     - Left side: Current content (oldText highlighted in red)
     - Right side: Proposed content (newText highlighted in green)
  4. Editor scrolls to the diff location
  5. User sees three action buttons: [Approve] [Reject] [Edit]

Approve flow:
  - System applies the newText to the document
  - Switches back to WYSIWYG view
  - Notifies agent: { action: "approved", suggestionId }

Reject flow:
  - System discards the proposed change
  - Switches back to WYSIWYG view
  - Notifies agent: { action: "rejected", suggestionId, reason? }
  - Agent can propose alternative or move on

Edit flow:
  - User modifies the proposed newText directly in diff view
  - User clicks [Apply Edited]
  - System applies user's modified version
  - Notifies agent: { action: "edited", suggestionId, userVersion }
  - Agent learns from user's preference
```

### FR-13f: Diff View Configuration

```
Given MDXEditor is configured for diff-based review
When initializing the editor
Then the system:
  1. Enables diffSourcePlugin() with viewMode support
  2. Stores original markdown for diff comparison
  3. Provides API to show diff between current and proposed content:
     - showDiff(originalContent, proposedContent, changeLocation)
  4. Provides API to exit diff view:
     - exitDiffView(applyChanges: boolean)
```

### FR-13g: Agent Feedback Loop

```
Given the user takes an action on a suggestion (approve/reject/edit)
When the action is completed
Then the system sends feedback to the agent:

Approved:
{
  "action": "approved",
  "suggestionId": "sug-001",
  "appliedText": "The actual text that was applied"
}

Rejected:
{
  "action": "rejected",
  "suggestionId": "sug-001",
  "userReason": "Optional reason from user",
  "context": "Keep original wording"
}

Edited:
{
  "action": "edited",
  "suggestionId": "sug-001",
  "originalProposal": "What agent suggested",
  "userVersion": "What user changed it to",
  "diff": "Unified diff between proposal and user version"
}

And the agent:
  - Acknowledges the feedback
  - May propose follow-up suggestions based on user's edits
  - Learns user preferences for future suggestions in session
```

### FR-13h: Batch Diff Review

```
Given the agent has multiple suggestions for the same section
When displaying suggestions
Then the system can:
  1. Show individual diffs one at a time (default)
  2. Or combine related suggestions into a single diff view
  3. User can navigate between suggestions: [Previous] [Next]
  4. User can approve/reject all: [Approve All] [Reject All]

Navigation shows: "Suggestion 2 of 5 - Clarity Issues"
```

### FR-14: Interactive Dashboard - Suggestion Cards

```
Given the review completes with suggestions
When displaying results in the right panel
Then each suggestion is displayed as an interactive card containing:
  - Issue description and location (section reference + line numbers)
  - Severity indicator (critical, warning, info)
  - Preview of proposed change (truncated)
  - [Review Diff] button - opens diff view in editor (primary action)
  - [Show in Editor] button - scrolls to location without diff
  - [Dismiss] button - rejects without viewing diff
And suggestions are grouped by category (clarity, testability, scope, etc.)

When user clicks [Review Diff]:
  1. Editor switches to diff view
  2. Shows current vs proposed side-by-side
  3. Action buttons appear: [Approve] [Reject] [Edit]
  4. User decision is sent back to agent
```

### FR-15: Interactive Dashboard - Diff Approval Flow

```
Given the user is viewing a diff for a suggestion
When the user clicks [Approve]
Then the system:
  1. Applies the proposed newText to the document
  2. Exits diff view, returns to WYSIWYG mode
  3. Scrolls to show the applied change
  4. Highlights the changed section briefly (2 seconds)
  5. Suggestion card updates to show "✓ Approved"
  6. Change is logged for potential revert
  7. Feedback sent to agent: { action: "approved", ... }
  8. File is saved to disk

When the user clicks [Reject]:
  1. Discards the proposed change
  2. Exits diff view, returns to WYSIWYG mode
  3. Optionally prompts for rejection reason
  4. Suggestion card updates to show "✗ Rejected"
  5. Feedback sent to agent: { action: "rejected", reason?, ... }
  6. Agent may propose alternative based on feedback

When the user clicks [Edit] and modifies:
  1. User edits the proposed text in diff view
  2. User clicks [Apply Edited]
  3. System applies user's modified version
  4. Exits diff view, returns to WYSIWYG mode
  5. Suggestion card updates to show "✓ Applied (edited)"
  6. Feedback sent to agent: { action: "edited", userVersion, ... }
  7. Agent learns from user's modifications
```

### FR-16: Interactive Dashboard - Chat-Based Changes

```
Given the user types a message in the chat interface
When the message requests a change (e.g., "make section 3 more specific")
Then the system:
  1. Sends message to agent with current spec context
  2. Agent proposes the change with diff preview
  3. User sees proposed change as a new interactive card
  4. User can [Apply] or [Dismiss] the proposed change
And if the user asks a question (not a change request)
Then the agent responds conversationally without proposing changes
```

### FR-17: Interactive Dashboard - God Spec Actions

```
Given a god spec is detected
When displaying the god spec warning
Then the system shows an interactive card with:
  - Warning icon and "God Spec Detected" header
  - Explanation of why it's problematic
  - List of proposed split specs with estimated story counts
  - [Accept Split] button - creates all split files
  - [Modify] button - opens dialog to adjust the split
  - [Skip] button - dismisses warning with "not recommended" note
And clicking [Accept Split]:
  1. Creates new spec files
  2. Opens file picker to select which split to review next
  3. Original spec remains open in preview for reference
```

### FR-18: Interactive Dashboard - Live Preview Updates

```
Given the spec file is modified (by Apply Fix or chat request)
When the file changes on disk
Then the left panel automatically reloads the spec content
And the scroll position is preserved
And the changed section is scrolled into view if not visible
And a brief highlight animation shows what changed
```

### FR-19: Interactive Dashboard - Change History

```
Given one or more changes have been applied during the session
When the user wants to review or revert changes
Then the system provides:
  - "Changes" tab showing list of all applied fixes
  - Each change shows: timestamp, description, section affected
  - [Revert] button on each change to undo it
  - [Revert All] button to restore original spec
And reverting a change:
  1. Restores the previous content
  2. Updates the spec preview
  3. Re-enables the original suggestion card
```

### FR-20: Session Storage - File-Based

```
Given a spec file exists (e.g., `specs/user-management.md`)
When the user starts or continues a review
Then the system uses a corresponding session file:
  - Location: `.ralph/sessions/{spec-basename}.session.json`
  - Example: `specs/user-management.md` → `.ralph/sessions/user-management.session.json`

Session file is:
  - Created on first review if it doesn't exist
  - Loaded automatically when spec is selected
  - Saved after every change (suggestions, edits, chat)
  - Committed to git with the project (persistent history)
```

### FR-21: Session File Structure

```
Given a session file exists
Then it contains:
{
  "specFile": "specs/user-management.md",
  "originalContentHash": "sha256:abc123...",     // To detect external changes
  "lastReviewedAt": "2026-01-10T10:30:00Z",
  "reviewCount": 3,                               // How many times reviewed

  "splitSpecs": [                                 // Specs created from this one
    {
      "filename": "specs/user-management.registration.md",
      "createdAt": "2026-01-10T10:35:00Z",
      "sessionFile": ".ralph/sessions/user-management.registration.session.json"
    }
  ],
  "parentSpec": null,                             // If this was split from another

  "suggestions": [...],                           // Current/historical suggestions
  "changeHistory": [...],                         // All changes made
  "chatHistory": [...],                           // Conversation with agent
  "agentContext": "...",                          // For preference learning

  "status": "in_progress" | "completed" | "needs_attention",
  "verdict": "PASS" | "FAIL" | "NEEDS_IMPROVEMENT" | "SPLIT_RECOMMENDED" | null
}
```

### FR-22: Session Loading

```
Given the user selects a spec file to review
When opening the spec in the dashboard
Then the system:
  1. Checks for existing session file at `.ralph/sessions/{basename}.session.json`
  2. If exists:
     - Loads all session state (suggestions, history, chat)
     - Compares originalContentHash with current file
     - If spec changed externally, shows warning: "Spec modified since last review"
     - User can [Continue] with existing session or [Start Fresh]
  3. If not exists:
     - Creates new session file
     - Runs initial review
```

### FR-23: Session Auto-Save

```
Given an active review session
When any of these events occur:
  - Suggestion approved/rejected/edited
  - Chat message sent/received
  - Split proposal accepted
  - Any spec modification
Then the system:
  1. Updates session JSON file immediately
  2. No explicit "save" needed - always persisted
  3. File can be committed to git at any time
```

### FR-24: Split Spec Tracking

```
Given a god spec is split into multiple specs
When the split is executed
Then the system:
  1. Creates new spec files (e.g., user-management.registration.md)
  2. Creates session file for EACH new spec
  3. Updates PARENT session with splitSpecs array
  4. Each CHILD session has parentSpec reference
  5. Parent session file tracks all children for navigation

Example parent session after split:
{
  "specFile": "specs/user-management.md",
  "splitSpecs": [
    { "filename": "specs/user-management.registration.md", ... },
    { "filename": "specs/user-management.authentication.md", ... },
    { "filename": "specs/user-management.profile.md", ... }
  ]
}

Example child session:
{
  "specFile": "specs/user-management.registration.md",
  "parentSpec": "specs/user-management.md",
  "splitSpecs": []
}
```

### FR-25: Session Navigation

```
Given a spec has been split into multiple child specs
When viewing the parent spec in the dashboard
Then the system shows:
  - "This spec was split into 3 specs" banner
  - Links to each child spec for easy navigation
  - Option to review each child independently

When viewing a child spec:
  - "Split from: user-management.md" link shown
  - Can navigate back to parent
```

### FR-26: Dynamic Loop Limit for Task Execution

```
Given the user executes tasks from the dashboard
When calculating the loop limit
Then the system:
  1. Counts existing tasks in the PRD marked for execution
  2. Counts new tasks being added (if any)
  3. Calculates: loopLimit = (existingTasks + newTasks) * 1.2
  4. Rounds up to nearest integer
  5. Uses this calculated limit instead of default 25

When new tasks are added during execution:
  1. System recalculates the loop limit using the same formula
  2. Loop limit is updated (not the current task index)
  3. All tasks fit within the new window

Examples:
  - 10 existing tasks, 0 new → limit = ceil(10 * 1.2) = 12
  - 20 existing tasks, 5 new → limit = ceil(25 * 1.2) = 30
  - 40 existing tasks, 10 new → limit = ceil(50 * 1.2) = 60

Note: The 20% buffer accounts for:
  - Subtask generation during execution
  - Retry attempts on failed tasks
  - Agent context-switching overhead
```

---

## 8. Data Contracts (First-Class)

### CLI Output: Human-Readable (Default)

```
============================================
  Spec Review: my-feature.md
============================================

Verdict: NEEDS_IMPROVEMENT

Requirements Completeness: PASS
  All required sections present

Clarity and Specificity: NEEDS_IMPROVEMENT
  - Section 4.2: "The system should be fast" - no measurable criteria
  - Section 5.1: "Handle errors appropriately" - needs specific error handling behavior

Testability: PASS
  All requirements are verifiable

Scope Validation: PASS
  No scope creep detected

Suggestions:
  1. Add response time SLA to Section 4.2 (e.g., "< 200ms p95")
  2. Define specific error codes and messages in Section 5.1

Log: .ralph/logs/spec_review_2026-01-10T10-30-00.log
```

### CLI Output: God Spec Detected (SPLIT_RECOMMENDED)

```
============================================
  Spec Review: user-management.md
============================================

Verdict: SPLIT_RECOMMENDED

This spec appears to be a "god spec" covering multiple independent features.

Detected issues:
  - 5 major feature sections identified
  - Estimated 25+ user stories
  - Multiple unrelated user journeys (registration, auth, profile, admin, reporting)
  - Touches 4 system boundaries (auth, database, email, admin panel)

============================================
  Recommended Split
============================================

  1. user-management.registration.md
     User signup, email verification, account activation
     Estimated: 5-7 user stories

  2. user-management.authentication.md
     Login, logout, password reset, session management
     Estimated: 6-8 user stories

  3. user-management.profile.md
     Profile editing, avatar upload, preferences
     Estimated: 4-6 user stories

  4. user-management.admin.md
     User administration, roles, permissions
     Estimated: 5-7 user stories

  5. user-management.reporting.md
     User analytics, activity logs, exports
     Estimated: 4-5 user stories

? How would you like to proceed?
  > Accept - Create all split spec files
    Modify - Edit the proposed split
    Skip - Continue with current spec (not recommended)
```

### CLI Output: Split Accepted

```
============================================
  Creating Split Specs
============================================

Created:
  ✓ specs/user-management.registration.md
  ✓ specs/user-management.authentication.md
  ✓ specs/user-management.profile.md
  ✓ specs/user-management.admin.md
  ✓ specs/user-management.reporting.md

Original spec preserved: specs/user-management.md

Next steps:
  1. Review each split spec for completeness
  2. Run `qala spec review specs/user-management.registration.md`
  3. Decompose each spec independently with `qala decompose`
```

### CLI Output: JSON (--json flag)

```json
{
  "file": "my-feature.md",
  "verdict": "NEEDS_IMPROVEMENT",
  "categories": {
    "godSpecDetection": {
      "verdict": "PASS",
      "isGodSpec": false,
      "indicators": []
    },
    "requirementsCompleteness": {
      "verdict": "PASS",
      "issues": []
    },
    "claritySpecificity": {
      "verdict": "NEEDS_IMPROVEMENT",
      "issues": [
        {
          "section": "4.2",
          "text": "The system should be fast",
          "reason": "No measurable criteria"
        }
      ]
    },
    "testability": {
      "verdict": "PASS",
      "issues": []
    },
    "scopeValidation": {
      "verdict": "PASS",
      "issues": []
    }
  },
  "splitProposal": null,
  "codebaseContext": {
    "projectType": "typescript-node",
    "existingPatterns": ["REST API", "PostgreSQL", "Express"],
    "relevantFiles": ["src/auth/", "src/users/"]
  },
  "suggestions": [
    {
      "priority": "high",
      "section": "4.2",
      "action": "Add response time SLA (e.g., '< 200ms p95')"
    }
  ],
  "logPath": ".ralph/logs/spec_review_2026-01-10T10-30-00.log",
  "durationMs": 45230
}
```

### CLI Output: JSON with Split Proposal

```json
{
  "file": "user-management.md",
  "verdict": "SPLIT_RECOMMENDED",
  "categories": {
    "godSpecDetection": {
      "verdict": "SPLIT_RECOMMENDED",
      "isGodSpec": true,
      "indicators": [
        "5 major feature sections identified",
        "Estimated 25+ user stories",
        "Multiple unrelated user journeys",
        "Touches 4 system boundaries"
      ]
    },
    "requirementsCompleteness": {
      "verdict": "PASS",
      "issues": []
    },
    "claritySpecificity": {
      "verdict": "PASS",
      "issues": []
    },
    "testability": {
      "verdict": "PASS",
      "issues": []
    },
    "scopeValidation": {
      "verdict": "NEEDS_IMPROVEMENT",
      "issues": [
        {
          "section": "Overall",
          "reason": "Spec scope too broad for single decomposition"
        }
      ]
    }
  },
  "splitProposal": {
    "originalFile": "user-management.md",
    "reason": "Spec covers multiple independent feature domains",
    "proposedSpecs": [
      {
        "filename": "user-management.registration.md",
        "description": "User signup, email verification, account activation",
        "estimatedStories": "5-7",
        "sections": ["2.1 Registration Flow", "2.2 Email Verification"]
      },
      {
        "filename": "user-management.authentication.md",
        "description": "Login, logout, password reset, session management",
        "estimatedStories": "6-8",
        "sections": ["3.1 Login", "3.2 Password Reset", "3.3 Sessions"]
      },
      {
        "filename": "user-management.profile.md",
        "description": "Profile editing, avatar upload, preferences",
        "estimatedStories": "4-6",
        "sections": ["4.1 Profile", "4.2 Avatar", "4.3 Preferences"]
      }
    ]
  },
  "codebaseContext": {
    "projectType": "typescript-node",
    "existingPatterns": ["REST API", "PostgreSQL", "Express"],
    "relevantFiles": ["src/auth/", "src/users/"]
  },
  "suggestions": [
    {
      "priority": "critical",
      "action": "Split this spec into smaller, focused specs before decomposition"
    }
  ],
  "logPath": ".ralph/logs/spec_review_2026-01-10T10-30-00.log",
  "durationMs": 62150
}
```

### Decompose Review Feedback (Existing Format - Updated)

```json
{
  "verdict": "PASS" | "FAIL",
  "missingRequirements": ["[Section: Auth] User password reset flow not covered"],
  "contradictions": ["[US-003] Task says REST API but spec specifies GraphQL"],
  "dependencyErrors": ["[US-005] Depends on US-999 which does not exist"],
  "duplicates": ["[US-002, US-007] Both tasks implement user login"],
  "suggestions": ["[US-003] Change API type from REST to GraphQL"]
}
```

### Settings File: ~/.qala/config.json

```json
{
  "reviewer": {
    "cli": "claude"
  },
  "execution": {
    "keepAwake": true
  }
}
```

Note: Default CLI is now `claude` (changed from `codex`). Users can manually set to `codex` if preferred.

### Session File Contract (`.ralph/sessions/{basename}.session.json`)

```typescript
interface SessionFile {
  // Identity
  specFile: string;                     // Relative path to spec file
  originalContentHash: string;          // SHA256 hash to detect external changes

  // Timestamps
  createdAt: string;                    // ISO timestamp - first review
  lastReviewedAt: string;               // ISO timestamp - most recent activity
  reviewCount: number;                  // How many review sessions

  // Split tracking
  splitSpecs: SplitSpecRef[];           // Child specs created from this one
  parentSpec: string | null;            // If this was split from another spec

  // Review state
  suggestions: SuggestionCard[];        // Current and historical suggestions
  changeHistory: ChangeHistoryEntry[];  // All changes for revert
  chatHistory: ChatMessage[];           // Conversation with agent
  agentContext: string;                 // Serialized context for preference learning

  // Status
  status: 'in_progress' | 'completed' | 'needs_attention';
  verdict: 'PASS' | 'FAIL' | 'NEEDS_IMPROVEMENT' | 'SPLIT_RECOMMENDED' | null;
}

interface SplitSpecRef {
  filename: string;                     // Relative path to child spec
  description: string;                  // What this split covers
  createdAt: string;                    // When split was created
  sessionFile: string;                  // Path to child's session file
}

interface SuggestionCard {
  id: string;
  category: 'godSpec' | 'requirements' | 'clarity' | 'testability' | 'scope';
  severity: 'critical' | 'warning' | 'info';
  section: string;                      // e.g., "## 2. Goals"
  lineStart: number;
  lineEnd: number;
  textSnippet: string;                  // Exact text being referenced
  issue: string;                        // What's wrong
  suggestedFix: string;                 // Proposed replacement
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  userVersion?: string;                 // If edited, what user changed it to
  reviewedAt?: string;                  // When action was taken
}

interface ChangeHistoryEntry {
  id: string;
  suggestionId: string;
  timestamp: string;
  action: 'approved' | 'rejected' | 'edited';
  section: string;
  oldText: string;
  newText: string;
  canRevert: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  selectedText?: string;                // If user had text selected
  suggestionId?: string;                // If message created a suggestion
}
```

### Example Session File

```json
// .ralph/sessions/user-management.session.json
{
  "specFile": "specs/user-management.md",
  "originalContentHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "createdAt": "2026-01-10T09:00:00Z",
  "lastReviewedAt": "2026-01-10T10:35:00Z",
  "reviewCount": 3,

  "splitSpecs": [
    {
      "filename": "specs/user-management.registration.md",
      "description": "User signup, email verification, account activation",
      "createdAt": "2026-01-10T10:35:00Z",
      "sessionFile": ".ralph/sessions/user-management.registration.session.json"
    },
    {
      "filename": "specs/user-management.authentication.md",
      "description": "Login, logout, password reset, session management",
      "createdAt": "2026-01-10T10:35:00Z",
      "sessionFile": ".ralph/sessions/user-management.authentication.session.json"
    }
  ],
  "parentSpec": null,

  "suggestions": [
    {
      "id": "sug-001",
      "category": "clarity",
      "severity": "warning",
      "section": "## 2. Goals",
      "lineStart": 45,
      "lineEnd": 46,
      "textSnippet": "The system should be fast",
      "issue": "No measurable criteria for 'fast'",
      "suggestedFix": "The system should respond in < 200ms (p95)",
      "status": "approved",
      "reviewedAt": "2026-01-10T10:20:00Z"
    }
  ],

  "changeHistory": [
    {
      "id": "chg-001",
      "suggestionId": "sug-001",
      "timestamp": "2026-01-10T10:20:00Z",
      "action": "approved",
      "section": "## 2. Goals",
      "oldText": "The system should be fast",
      "newText": "The system should respond in < 200ms (p95)",
      "canRevert": true
    }
  ],

  "chatHistory": [
    {
      "id": "msg-001",
      "role": "user",
      "content": "Is section 3 specific enough?",
      "timestamp": "2026-01-10T10:15:00Z",
      "selectedText": "Users should be able to manage their preferences"
    },
    {
      "id": "msg-002",
      "role": "agent",
      "content": "Section 3 could be more specific. Consider defining...",
      "timestamp": "2026-01-10T10:15:05Z",
      "suggestionId": "sug-002"
    }
  ],

  "agentContext": "User prefers explicit metrics. Rejected vague language twice.",

  "status": "completed",
  "verdict": "SPLIT_RECOMMENDED"
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RALPH_REVIEW_TIMEOUT_MS` | Timeout for review operations in milliseconds | 600000 (10 min) |
| `RALPH_MAX_REVIEW_ATTEMPTS` | Max retry attempts for decompose --review | 3 |

Note: Session data is file-based (`.ralph/sessions/`) and persists in git, so no session timeout/retention env vars are needed.

---

## 9. Constraints & Assumptions

### Performance
- Each focused prompt should complete within 60 seconds individually
- Total review (4 prompts) should complete within configured timeout
- Timeout is configurable from 30 seconds to 30 minutes

### Security
- Spec files are read from local filesystem only
- No external API calls beyond the selected CLI (claude/codex)
- File paths are validated to be within project directory or specified path

### CLI Selection
- Claude is the default (more widely available, better general capability)
- Codex is supported for users who prefer it
- --cli flag overrides config for one-off usage

### Prompt Design
- Each prompt has a single responsibility (one concern)
- Prompts are independent and can be parallelized in future versions
- Current implementation runs sequentially for reliability
- Prompts output structured JSON only, no prose

---

## 10. Failure Modes

### Failure: CLI Not Available
- Condition: Selected CLI binary not found in PATH
- Expected System Response: Display specific error with installation instructions
- Observable Outcome: Clear error message, exit code 1

### Failure: Spec File Not Found
- Condition: Specified file doesn't exist or isn't readable
- Expected System Response: Display "File not found: `<path>`"
- Observable Outcome: Error message, exit code 1

### Failure: Agent Crash
- Condition: CLI process exits with non-zero code
- Expected System Response: Capture stderr, display error with retry suggestion
- Observable Outcome: Error message with details, partial results if available

### Failure: Timeout
- Condition: Review exceeds configured timeout
- Expected System Response: Terminate gracefully, show partial results
- Observable Outcome: Timeout message with suggestion to increase timeout

### Failure: Invalid JSON Response
- Condition: AI returns unparseable or invalid schema response
- Expected System Response: Try fallback parsing strategies, log raw output
- Observable Outcome: Degraded results or specific parse error

### Failure: Golden Standard Missing
- Condition: .ralph/standards/ files not found
- Expected System Response: Use built-in default rules, show warning
- Observable Outcome: Review proceeds with defaults, warning displayed

---

## 11. Metrics & SLIs

- Review completion rate (>= 95% should complete without error)
- Average review duration per prompt (target: < 30 seconds)
- Total review duration (target: < 2 minutes for 4 prompts)
- Parse success rate (>= 99% of AI responses should parse correctly)
- False positive rate (FAIL verdicts that users override)

---

## 12. Rollout & Migration

### Breaking Changes
- **Default CLI changed from Codex to Claude**: Existing users with no config will now use Claude
- Users who explicitly set `reviewer.cli: "codex"` are unaffected

### Migration Steps
1. Users who prefer Codex should update `~/.qala/config.json`:
   ```json
   { "reviewer": { "cli": "codex" } }
   ```
2. Or use `--cli codex` flag per invocation

### Feature Flags
- None required (additive feature with config-based CLI selection)

### Backward Compatibility
- `qala decompose --review` continues to work unchanged
- New `qala spec review` command is purely additive
- Timeout env var is additive (existing hardcoded timeout becomes the default)

### Rollback Plan
- To restore Codex as default: update DEFAULT_SETTINGS in settings.ts
- New CLI command can be removed without affecting other features

---

## 13. Definition of Done (Verifiable)

### CLI Command (`qala spec review`)
- [ ] `qala spec review <file>` runs review on specified file
- [ ] `qala spec review` prompts for file selection when no argument
- [ ] `--timeout <ms>` flag overrides default timeout
- [ ] `--cli claude|codex` flag overrides config
- [ ] `--json` flag outputs machine-readable JSON
- [ ] `--verbose` flag shows detailed progress
- [ ] Exit code 0 on PASS, 1 on FAIL/NEEDS_IMPROVEMENT/SPLIT_RECOMMENDED, 2 on error

### Agent Tool Access
- [ ] Agent is spawned with full tool access (NOT `--tools ''`)
- [ ] Agent can read files in the codebase
- [ ] Agent can search/grep the codebase
- [ ] Agent explores codebase before running review prompts
- [ ] Codebase context is included in review output

### God Spec Detection & Splitting
- [ ] God spec detection prompt runs first
- [ ] Detection identifies specs with 15+ estimated stories
- [ ] Detection identifies specs with multiple unrelated feature domains
- [ ] Split proposal generated with correct naming: `{basename}.{feature}.md`
- [ ] User prompted with Accept/Modify/Skip options
- [ ] Accept creates new spec files in same directory
- [ ] Original spec preserved (not deleted or modified)
- [ ] SPLIT_RECOMMENDED verdict returned when god spec detected

### Focused Prompts (Standalone Review)
- [ ] God spec detection prompt runs and returns structured output
- [ ] Requirements completeness prompt runs and returns structured output
- [ ] Clarity/specificity prompt runs and returns structured output
- [ ] Testability prompt runs and returns structured output
- [ ] Scope validation prompt runs and returns structured output
- [ ] Results aggregated into single verdict

### Focused Prompts (Decompose Review) - No Tools
- [ ] Missing requirements prompt runs independently
- [ ] Contradictions prompt runs independently
- [ ] Dependency validation prompt runs independently
- [ ] Duplicate detection prompt runs independently
- [ ] Results aggregated for PASS/FAIL verdict
- [ ] Agent runs without tools (pure document comparison)

### Configuration
- [ ] Default CLI is Claude (not Codex)
- [ ] `RALPH_REVIEW_TIMEOUT_MS` env var is respected (default 10 min)
- [ ] `~/.qala/config.json` reviewer.cli setting is respected
- [ ] --cli flag overrides config

### Error Handling
- [ ] Timeout displays helpful message with current timeout value
- [ ] CLI not found displays installation instructions
- [ ] Parse errors log raw output for debugging
- [ ] Partial results shown on timeout

### Logging
- [ ] All review attempts logged to .ralph/logs/
- [ ] Each prompt's input/output saved separately
- [ ] JSON summary available for programmatic access
- [ ] Codebase exploration logged

### Integration Tests
- [ ] `qala spec review specs/sample.md` completes successfully
- [ ] `qala spec review` with god spec triggers split proposal
- [ ] Split acceptance creates correctly named files
- [ ] `qala decompose specs/sample.md --review` uses new focused prompts
- [ ] Timeout works correctly at boundaries (30s min, 30m max)
- [ ] Claude and Codex both work when available

### Interactive Dashboard UI
- [ ] Split view layout: MDXEditor (left) | review panel (right)
- [ ] Panels are resizable
- [ ] MDXEditor configured with required plugins (headings, lists, code, tables, diff, etc.)
- [ ] Suggestions displayed as interactive cards with [Review Diff] [Show in Editor] [Dismiss]
- [ ] [Review Diff] switches editor to diff view mode
- [ ] [Show in Editor] scrolls to referenced section and highlights text
- [ ] Diff view shows current vs proposed side-by-side
- [ ] Diff view has [Approve] [Reject] [Edit] buttons
- [ ] User can edit proposed changes in diff view before approving
- [ ] All approve/reject/edit actions sent back to agent as feedback
- [ ] Agent can propose alternatives after rejection
- [ ] Spec updates live after approval via MDXEditor ref
- [ ] Changed sections highlighted briefly (2 seconds)
- [ ] Chat interface allows conversational requests
- [ ] Chat change requests create new suggestion cards with diffs
- [ ] God spec warning shows [Accept Split] [Modify] [Skip] buttons
- [ ] [Accept Split] creates files and offers to open split spec
- [ ] Change history tab shows all approved/rejected/edited suggestions
- [ ] [Revert] button restores previous content
- [ ] Batch navigation: [Previous] [Next] [Approve All] [Reject All]
- [ ] All interactions are non-blocking (async with loading states)

### MDXEditor Integration
- [ ] MDXEditor component renders spec content
- [ ] All required plugins enabled (headings, lists, quotes, code, tables, markdown shortcuts)
- [ ] diffSourcePlugin enabled for diff view mode
- [ ] Editor ref accessible for programmatic control
- [ ] rootEditor$ cell used for Lexical access
- [ ] Scroll to section works via Lexical node lookup
- [ ] Text highlighting works via Lexical decorations
- [ ] Diff view shows current vs proposed side-by-side
- [ ] Proposed side is editable in diff view
- [ ] showDiff(original, proposed, location) API works
- [ ] exitDiffView(applyChanges) API works
- [ ] Agent edits applied via ref.current.setMarkdown() or Lexical transforms
- [ ] Selection captured and sent with chat messages
- [ ] onChange syncs to application state and saves to disk

### Agent Feedback Loop
- [ ] Approved actions send feedback to agent
- [ ] Rejected actions send feedback with optional reason
- [ ] Edited actions send feedback with user's modified version
- [ ] Agent acknowledges feedback
- [ ] Agent can propose alternatives after rejection
- [ ] Agent context maintained within session for preference learning

### File-Based Session Management
- [ ] Session file created at `.ralph/sessions/{basename}.session.json` on first review
- [ ] Original spec content hash stored for change detection
- [ ] Session auto-saves after every change (suggestions, edits, chat)
- [ ] Existing session loaded automatically when spec is selected
- [ ] External spec change detection with warning and options
- [ ] Split specs tracked in parent session's `splitSpecs` array
- [ ] Child sessions reference `parentSpec` for navigation
- [ ] Session files committable to git (persistent history)
- [ ] Change history enables revert of any modification
- [ ] Chat history preserved across browser sessions

### Dynamic Loop Limit
- [ ] Loop limit calculated as: `ceil((existingTasks + newTasks) * 1.2)`
- [ ] Default of 25 is NOT used when task count is known
- [ ] Adding tasks recalculates limit (not current index)
- [ ] All tasks fit within calculated window
- [ ] 20% buffer applied for subtasks, retries, and overhead

---

## Implementation Files

### New Files Required

**CLI Command:**
- `src/cli/commands/spec.ts` - Parent command for spec subcommands
- `src/cli/commands/spec-review.ts` - The `qala spec review` implementation

**Core Logic:**
- `src/core/spec-review/runner.ts` - Orchestrates focused prompt execution
- `src/core/spec-review/prompts.ts` - Focused prompt definitions (including god spec detection)
- `src/core/spec-review/aggregator.ts` - Combines prompt results into verdict
- `src/core/spec-review/god-spec-detector.ts` - God spec detection and split proposal logic
- `src/core/spec-review/splitter.ts` - Executes spec splitting, creates new files
- `src/core/spec-review/codebase-context.ts` - Gathers codebase context for review

**Types:**
- Add to `src/types/index.ts`:
  - `SpecReviewResult`
  - `SpecReviewCategory`
  - `FocusedPromptResult`
  - `GodSpecIndicators`
  - `SplitProposal`
  - `ProposedSpec`
  - `CodebaseContext`
  - `SuggestionCard`
  - `ChangeHistoryEntry`

**Dashboard UI (Frontend):**
- `web/src/pages/SpecReviewPage.tsx` - Main page with split view layout
- `web/src/components/spec-review/SpecEditor.tsx` - MDXEditor wrapper (left panel)
- `web/src/components/spec-review/ReviewPanel.tsx` - Review results container (right panel)
- `web/src/components/spec-review/SuggestionCard.tsx` - Interactive suggestion with Apply/Dismiss/Show
- `web/src/components/spec-review/GodSpecWarning.tsx` - God spec detection card with actions
- `web/src/components/spec-review/ReviewChat.tsx` - Chat interface for follow-up
- `web/src/components/spec-review/ChangeHistory.tsx` - List of applied changes with revert
- `web/src/hooks/useSpecReview.ts` - State management for review session
- `web/src/hooks/useSpecEditor.ts` - MDXEditor state, selection, and ref management

**MDXEditor Utilities:**
- `web/src/lib/mdx-editor/config.ts` - MDXEditor plugin configuration
- `web/src/lib/mdx-editor/lexical-utils.ts` - Lexical helpers for scroll/highlight
  - `scrollToSection(editor, sectionHeading)` - Scroll to heading
  - `scrollToLine(editor, lineNumber)` - Scroll to specific line
  - `highlightText(editor, textSnippet, duration)` - Temporary highlight
  - `findNodeByText(editor, text)` - Find Lexical node containing text
  - `getSelectedText(editor)` - Get current selection
- `web/src/lib/mdx-editor/editor-commands.ts` - Programmatic edit commands
  - `replaceText(editor, oldText, newText)` - Replace text in document
  - `insertAtLine(editor, line, text)` - Insert at specific line
  - `deleteLines(editor, startLine, endLine)` - Delete line range
- `web/src/lib/mdx-editor/diff-utils.ts` - Diff view management
  - `showDiff(editorRef, original, proposed, location)` - Enter diff mode
  - `exitDiffView(editorRef, applyChanges)` - Exit diff mode
  - `getProposedContent(editorRef)` - Get user-edited proposed content
  - `createUnifiedDiff(original, modified)` - Generate unified diff string

**Agent Feedback:**
- `web/src/lib/agent-feedback.ts` - Send feedback to agent
  - `sendApprovalFeedback(sessionId, suggestionId, appliedText)`
  - `sendRejectionFeedback(sessionId, suggestionId, reason?)`
  - `sendEditFeedback(sessionId, suggestionId, originalProposal, userVersion)`
- `web/src/hooks/useAgentFeedback.ts` - React hook for feedback state

**Dashboard API (Backend):**
- `src/server/routes/spec-review.ts` - API routes for spec review
  - `GET /api/spec-review/files` - List available spec files
  - `POST /api/spec-review/start` - Start review session
  - `GET /api/spec-review/status/:sessionId` - Get review status/results
  - `POST /api/spec-review/feedback` - Send approve/reject/edit feedback to agent
  - `POST /api/spec-review/chat` - Send chat message
  - `POST /api/spec-review/split` - Execute spec split
  - `POST /api/spec-review/split/preview` - Preview split files before saving
  - `POST /api/spec-review/revert` - Revert a change
  - `GET /api/spec-review/suggestions/:sessionId` - Get pending suggestions
- `src/core/spec-review/change-tracker.ts` - Tracks changes for revert functionality
- `src/core/spec-review/feedback-handler.ts` - Processes user feedback, updates agent context

**File-Based Session Management:**
- `src/core/session/session-file.ts` - Read/write `.ralph/sessions/{basename}.session.json`
  - `loadSession(specFile: string): SessionFile | null`
  - `saveSession(session: SessionFile): void`
  - `getSessionPath(specFile: string): string`
  - `computeContentHash(content: string): string`
- `src/core/session/session-types.ts` - SessionFile, SplitSpecRef, SuggestionCard, etc.
- `src/server/routes/sessions.ts` - Session API routes
  - `GET /api/sessions/spec/:specPath` - Load session for spec file
  - `PUT /api/sessions/spec/:specPath` - Save session state
  - `GET /api/sessions/spec/:specPath/exists` - Check if session exists
- `web/src/hooks/useSession.ts` - React hook for session state management
- `web/src/lib/session-utils.ts` - Client-side session helpers (hash comparison, etc.)

**Task Execution:**
- `src/core/ralph-loop/loop-limit.ts` - Dynamic loop limit calculation
  - `calculateLoopLimit(existingTasks: number, newTasks: number): number`
  - Returns `ceil((existingTasks + newTasks) * 1.2)`
- `src/core/ralph-loop/task-executor.ts` - Modified to use dynamic limit
  - Recalculates limit when tasks are added mid-execution

### Files to Modify

**Settings:**
- `src/core/settings.ts` - Change default CLI from 'codex' to 'claude'

**Peer Review:**
- `src/core/decompose/peer-review.ts`:
  - Make timeout configurable via env var
  - Update `autoSelectCli()` to prefer Claude
  - Refactor `buildReviewPrompt()` into focused prompts

**CLI Registration:**
- `src/cli/index.ts` - Register new `spec` command

---

## Technical Notes

### Timeout Configuration

```typescript
// Priority: CLI flag > Env var > Default
function getReviewTimeout(cliTimeout?: number): number {
  if (cliTimeout !== undefined) {
    return validateTimeout(cliTimeout);
  }

  const envTimeout = process.env.RALPH_REVIEW_TIMEOUT_MS;
  if (envTimeout) {
    return validateTimeout(parseInt(envTimeout, 10));
  }

  return 600000; // 10 minutes default
}

function validateTimeout(ms: number): number {
  const MIN = 30000;    // 30 seconds
  const MAX = 1800000;  // 30 minutes

  if (ms < MIN) {
    console.warn(`Timeout ${ms}ms below minimum, using ${MIN}ms`);
    return MIN;
  }
  if (ms > MAX) {
    console.warn(`Timeout ${ms}ms above maximum, using ${MAX}ms`);
    return MAX;
  }
  return ms;
}
```

### Focused Prompt Structure (Decompose Review)

```typescript
// Prompt 1: Missing Requirements
const MISSING_REQUIREMENTS_PROMPT = `
You are checking if all spec requirements are covered by tasks.

INPUT:
- Spec document (markdown)
- Tasks JSON (array of user stories)

OUTPUT (JSON only):
{
  "verdict": "PASS" | "FAIL",
  "missing": [
    {
      "requirement": "Description of missing requirement",
      "specSection": "Section reference (e.g., '4.2 Authentication')"
    }
  ]
}

RULES:
- Every functional requirement in the spec must map to at least one task
- Non-functional requirements (performance, security) must have explicit tasks
- If ANY requirement is not covered, verdict is FAIL

===== SPEC =====
{specContent}

===== TASKS =====
{tasksJson}
`;

// Prompt 2: Contradictions
const CONTRADICTIONS_PROMPT = `
You are checking if any tasks contradict the spec.

INPUT:
- Spec document (markdown)
- Tasks JSON (array of user stories)

OUTPUT (JSON only):
{
  "verdict": "PASS" | "FAIL",
  "contradictions": [
    {
      "taskId": "US-XXX",
      "taskText": "What the task says",
      "specText": "What the spec says",
      "specSection": "Section reference"
    }
  ]
}

RULES:
- A contradiction is when a task explicitly conflicts with spec requirements
- Minor wording differences are NOT contradictions
- If the task says X and spec says NOT X, that's a contradiction
- If ANY contradictions exist, verdict is FAIL

===== SPEC =====
{specContent}

===== TASKS =====
{tasksJson}
`;

// Prompt 3: Dependency Validation
const DEPENDENCY_VALIDATION_PROMPT = `
You are validating task dependencies.

INPUT:
- Tasks JSON (array of user stories with dependencies)

OUTPUT (JSON only):
{
  "verdict": "PASS" | "FAIL",
  "errors": [
    {
      "taskId": "US-XXX",
      "dependsOn": "US-YYY",
      "reason": "US-YYY does not exist"
    }
  ]
}

RULES:
- Every task's dependencies must reference existing task IDs
- No circular dependencies allowed
- If ANY invalid dependencies exist, verdict is FAIL

===== TASKS =====
{tasksJson}
`;

// Prompt 4: Duplicate Detection
const DUPLICATE_DETECTION_PROMPT = `
You are detecting duplicate tasks.

INPUT:
- Tasks JSON (array of user stories)

OUTPUT (JSON only):
{
  "verdict": "PASS" | "FAIL",
  "duplicates": [
    {
      "taskIds": ["US-XXX", "US-YYY"],
      "reason": "Both implement user login functionality"
    }
  ]
}

RULES:
- Tasks are duplicates if they implement the same functionality
- Similar setup/teardown steps are NOT duplicates
- Overlapping but distinct features are NOT duplicates
- If significant duplicates exist, verdict is FAIL

===== TASKS =====
{tasksJson}
`;
```

### God Spec Detection Prompt

```typescript
const GOD_SPEC_DETECTION_PROMPT = `
You are analyzing a spec to determine if it is a "god spec" that should be split into smaller specs.

IMPORTANT: You have access to file reading and search tools. Use them to:
1. Explore the codebase structure
2. Understand existing patterns
3. Identify what parts of the codebase this spec would affect

First, explore the codebase, then analyze the spec.

INPUT:
- Spec document (markdown)
- Access to codebase via tools

OUTPUT (JSON only):
{
  "verdict": "PASS" | "SPLIT_RECOMMENDED",
  "isGodSpec": boolean,
  "indicators": [
    "Description of each indicator found"
  ],
  "estimatedStories": number,
  "featureDomains": ["domain1", "domain2"],
  "systemBoundaries": ["boundary1", "boundary2"],
  "splitProposal": {
    "reason": "Why this spec should be split",
    "proposedSpecs": [
      {
        "filename": "{basename}.{feature}.md",
        "description": "What this spec covers",
        "estimatedStories": "5-7",
        "sections": ["Section references from original"]
      }
    ]
  } | null
}

GOD SPEC INDICATORS (if 2+ present, recommend split):

Size indicators:
- More than 3 major feature sections
- Would decompose to > 15-20 user stories
- Document exceeds 2000 words of requirements

Scope indicators:
- Multiple unrelated user journeys
- Features that could be independently released
- Touches > 3 major system boundaries
- Mix of infrastructure and user-facing features

Cohesion indicators:
- No single "definition of done"
- Different target users/personas
- Weak dependencies between sections

SPLIT NAMING CONVENTION:
- Pattern: {original-basename}.{feature-name}.md
- Feature names: kebab-case, 1-3 words
- Each split must be end-to-end (delivers user value independently)
- Target 5-15 user stories per split spec

===== SPEC =====
{specContent}
`;
```

### Claude vs Codex Differences (Updated)

**For Spec Review (`qala spec review`) - WITH TOOLS:**

Claude:
- Invocation: `claude --dangerously-skip-permissions --print`
- **Do NOT use `--tools ''`** - agent needs full tool access
- Prompt via stdin includes instruction to explore codebase
- Output: Plain text (parse for JSON)
- Agent can read files, search, and explore codebase

Codex:
- Invocation: `codex exec --output-last-message <output-file> -`
- Prompt via stdin
- Output: Written to specified file
- Has built-in file access capabilities

**For Task Review (`qala decompose --review`) - WITHOUT TOOLS:**

Claude:
- Invocation: `claude --dangerously-skip-permissions --print --output-format text --tools ''`
- Tools disabled - pure document comparison
- Prompt via stdin with spec + tasks JSON
- Output: Plain text (parse for JSON)

Codex:
- Invocation: `codex exec --output-last-message <output-file> -`
- Prompt via stdin with spec + tasks JSON
- Output: Written to specified file
- No file access needed for document comparison

---

## Change Log

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-01-10 | Added standalone `qala spec review` command | Users wanted to review specs without running decompose |
| 2026-01-10 | Changed default CLI from Codex to Claude | Claude more widely available and capable |
| 2026-01-10 | Added configurable timeout via `RALPH_REVIEW_TIMEOUT_MS` (default 10 min) | 5-minute hardcoded timeout too aggressive for complex specs |
| 2026-01-10 | Introduced focused sub-prompts | Single mega-prompt was unreliable; one concern per prompt improves accuracy |
| 2026-01-10 | Renamed from "PRD Review" to "Spec Review" | Consistent terminology with qala conventions |
| 2026-01-10 | **Agent now has full tool access** | Agent needs to explore codebase to validate spec against actual architecture |
| 2026-01-10 | **Added god spec detection** | Detect overly ambitious specs and recommend splitting before decomposition |
| 2026-01-10 | **Added spec splitting with naming convention** | Split large specs into `{basename}.{feature}.md` format for end-to-end delivery |
| 2026-01-10 | Added codebase context gathering | Review quality improves when agent understands existing patterns |
| 2026-01-10 | Clarified tool access: spec review WITH tools, task review WITHOUT | Task review is pure document comparison; spec review needs codebase context |
| 2026-01-10 | **Added interactive dashboard UI** | Split view (spec preview + review/chat), all recommendations interactive |
| 2026-01-10 | Added [Apply Fix] functionality | User approves suggestion, agent makes the change, spec updates live |
| 2026-01-10 | Added chat-based change requests | User can ask for custom changes via chat, agent proposes fix |
| 2026-01-10 | Added change history with revert | Track all changes, allow reverting individual fixes |
| 2026-01-10 | **MDXEditor for spec editing** | WYSIWYG markdown editor built on Lexical with rich plugin support |
| 2026-01-10 | Added [Show in Editor] with scroll/highlight | Click suggestion to scroll to section and highlight referenced text |
| 2026-01-10 | Agent line references required | Agent must provide section, line numbers, and text snippets for suggestions |
| 2026-01-10 | Selection-based chat | User can select text in editor and ask questions about it |
| 2026-01-10 | **Diff-based suggestion review** | [Review Diff] shows side-by-side current vs proposed changes |
| 2026-01-10 | User can edit proposals in diff view | Modify agent's suggestion before approving |
| 2026-01-10 | **Agent feedback loop** | All approve/reject/edit actions sent back to agent for learning |
| 2026-01-10 | Agent proposes alternatives after rejection | Feedback enables iterative refinement |
| 2026-01-10 | Batch suggestion navigation | [Previous] [Next] [Approve All] [Reject All] for multiple suggestions |
| 2026-01-10 | Clarified purpose: help create perfect PRDs | Poor PRDs = poor products; goal is 100% task execution accuracy |
| 2026-01-10 | Referenced existing golden standard files | `.ralph/standards/golden_standard_prd_deterministic_decomposable.md` |
| 2026-01-10 | Clarified Non-Goals: no *automatic* editing | User-approved edits via [Approve] are in scope |
| 2026-01-10 | Split preview before saving | Accept/Modify shows preview; user must click [Save All] to write files |
| 2026-01-10 | **File-based session management** (FR-20 to FR-25) | Sessions stored in `.ralph/sessions/` - persists in git, tracks splits |
| 2026-01-10 | **Dynamic loop limit** (FR-26) | Loop limit = `ceil((existing + new) * 1.2)` instead of hardcoded 25 |

---

> **Summary**: This spec defines a Spec Review feature to help users create **perfect PRDs** that decompose deterministically. Available as CLI (`qala spec review`) and interactive dashboard. Key features:
> - **Goal**: 100% task execution accuracy through PRD quality validation
> - **Golden standard validation**: Uses `.ralph/standards/` rules (TLDR + full standard)
> - **MDXEditor integration**: WYSIWYG markdown editor built on Lexical
> - **Diff-based suggestions**: [Review Diff] shows side-by-side; user approves/rejects/edits
> - **Agent feedback loop**: All actions sent back to agent; learns within session
> - **Split preview before saving**: Accept/Modify shows preview; [Save All] to commit
> - **File-based sessions**: `.ralph/sessions/{basename}.session.json` persists in git
> - **Split tracking**: Parent sessions track child specs; child sessions reference parent
> - **God spec detection**: Identifies specs with 15+ stories; proposes splits
> - **Full tool access**: Agent explores codebase during spec review
> - **Dynamic loop limit**: `ceil((tasks) * 1.2)` instead of hardcoded 25; recalculates on task addition
> - Configurable timeout (default 10 min) via `RALPH_REVIEW_TIMEOUT_MS`
> - Claude as default CLI with focused single-purpose prompts
