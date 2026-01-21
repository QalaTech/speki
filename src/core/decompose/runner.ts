/**
 * PRD Decomposition Runner
 *
 * Takes a PRD markdown file and breaks it into small,
 * Ralph-compatible task files using Claude.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import chalk from 'chalk';
import { Project } from '../project.js';
import { parseStream } from '../claude/stream-parser.js';
import { PassThrough } from 'stream';
import { runPeerReview } from './peer-review.js';
import { loadGlobalSettings } from '../settings.js';
import { resolveCliPath } from '../cli-path.js';
import { runDecomposeReview } from '../spec-review/runner.js';
import { selectEngine } from '../llm/engine-factory.js';
import { getReviewTimeout } from '../spec-review/timeout.js';
import {
  extractSpecId,
  ensureSpecDir,
  getSpecLogsDir,
  readSpecMetadata,
  initSpecMetadata,
  updateSpecStatus,
  loadDecomposeStateForSpec,
  saveDecomposeStateForSpec,
  detectSpecType,
} from '../spec-review/spec-metadata.js';
import type { PRDData, DecomposeState, ReviewFeedback } from '../../types/index.js';

export interface DecomposeOptions {
  /** Path to the PRD markdown file */
  prdFile: string;
  /** Branch name for the feature */
  branchName?: string;
  /** Language type (dotnet, python, nodejs, go) */
  language?: string;
  /** Output filename (defaults to prd file basename + .json) */
  outputName?: string;
  /** Start fresh from US-001 (ignore existing numbering) */
  freshStart?: boolean;
  /** Force re-decomposition even if draft exists */
  forceRedecompose?: boolean;
  /** Enable peer review */
  enablePeerReview?: boolean;
  /** Max peer review attempts */
  maxReviewAttempts?: number;
  /** Review timeout in milliseconds (overrides default) */
  reviewTimeoutMs?: number;
  /** Callback for progress updates */
  onProgress?: (state: DecomposeState) => void;
  /** Preferred engine name and model (overrides settings/env) */
  engineName?: string;
  model?: string;
  /** Stream callbacks for real-time log output */
  streamCallbacks?: import('../claude/types.js').StreamCallbacks;
}

export interface DecomposeResult {
  /** Whether decomposition succeeded */
  success: boolean;
  /** Generated PRD data */
  prd?: PRDData;
  /** Path to the output file */
  outputPath?: string;
  /** Number of stories generated */
  storyCount: number;
  /** Peer review verdict */
  verdict?: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED';
  /** Error message if failed */
  error?: string;
}

/**
 * Get the decompose prompt template
 */
async function getDecomposePrompt(project: Project): Promise<string> {
  try {
    return await fs.readFile(project.decomposePromptPath, 'utf-8');
  } catch {
    // Return a default template if not found
    return getDefaultDecomposePrompt();
  }
}

/**
 * Default decompose prompt if template not found
 */
function getDefaultDecomposePrompt(): string {
  return `# PRD Decomposition Task

You are a senior technical architect breaking down a Product Requirements Document (PRD) into small, atomic user stories suitable for the Ralph iterative development technique.

## Your Task

Analyze the PRD provided below and decompose it into small, independent user stories that can each be completed in a single AI coding iteration.

## Output Format

Output ONLY valid JSON in this exact format:

\`\`\`json
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
        "Build succeeds with no warnings"
      ],
      "testCases": [
        "MethodName_Scenario_ExpectedResult - Description"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "dependencies": []
    }
  ]
}
\`\`\`

## Rules

1. Each story must be completable in ONE coding session
2. Maximum 3 files changed per story (excluding tests)
3. Include specific testCases for every story
4. Set all passes to false
5. Output ONLY the JSON, no explanations
`;
}

/**
 * Get the decompose prompt for a tech spec.
 * Tech specs generate implementation tasks (what needs to be built),
 * not user stories (what the user wants).
 */
function getTechSpecDecomposePrompt(): string {
  return `# Tech Spec Decomposition Task

You are a senior software engineer breaking down a Technical Specification into highly detailed, self-contained implementation tasks.

## Your Goal

Create tasks that an AI coding agent can execute **independently** without needing to discover or explore the codebase. Each task must contain ALL the information needed to implement it.

## What Makes a Good Tech Spec Task

Each task should include:
- **Exact file paths** to create or modify
- **Complete schemas/interfaces** copied from the tech spec
- **Method signatures** with parameter types and return types
- **Code patterns** to follow (copied from tech spec examples)
- **Integration points** - exactly how this connects to other components
- **Edge cases** and error handling requirements
- **Test scenarios** with specific inputs and expected outputs

## BAD vs GOOD Task Examples

**BAD** (too vague, requires discovery):
\`\`\`
"title": "Implement user service",
"description": "Create a service to handle user operations"
\`\`\`

**GOOD** (complete, executable):
\`\`\`
"title": "Implement UserService.CreateUser method",
"description": "Create src/services/UserService.ts with CreateUser method.

Schema (from tech spec):
interface CreateUserRequest {
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface CreateUserResponse {
  id: string;
  createdAt: Date;
}

Method signature:
async createUser(request: CreateUserRequest): Promise<CreateUserResponse>

Implementation:
1. Validate email format using existing EmailValidator
2. Check for duplicate email in UserRepository.findByEmail()
3. Hash password using bcrypt (12 rounds)
4. Insert via UserRepository.create()
5. Return response with generated UUID

Error handling:
- Throw DuplicateEmailError if email exists
- Throw ValidationError if email format invalid

File: src/services/UserService.ts
Imports: UserRepository from '../repositories', EmailValidator from '../utils'"
\`\`\`

## Output Format

Output ONLY valid JSON:

\`\`\`json
{
  "projectName": "Project name",
  "branchName": "BRANCH_NAME",
  "language": "dotnet|python|nodejs|go",
  "standardsFile": ".ralph/standards/{language}.md",
  "description": "What this tech spec implements",
  "userStories": [
    {
      "id": "TS-001",
      "title": "Implement [Component.Method] in [file path]",
      "description": "DETAILED implementation guide including:\\n- Exact file path\\n- Complete schema/interface definitions\\n- Method signatures\\n- Step-by-step implementation logic\\n- Error handling requirements\\n- Import statements needed",
      "acceptanceCriteria": [
        "File src/path/file.ts exists with Component class",
        "Method handles [specific scenario] correctly",
        "Throws [ErrorType] when [condition]",
        "Existing unit tests updated to cover new behavior",
        "New test cases added to existing test file (if test project exists)",
        "Build succeeds with no warnings"
      ],
      "testCases": [
        "Component_Method_ValidInput_ReturnsExpected",
        "Component_Method_InvalidInput_ThrowsValidationError",
        "Component_Method_DuplicateData_ThrowsConflictError"
      ],
      "priority": 1,
      "passes": false,
      "notes": "Edge cases: [list]. Dependencies: [list]",
      "dependencies": [],
      "achievesUserStories": ["US-XXX"]
    }
  ]
}
\`\`\`

## Rules

1. **Self-contained**: Each task has ALL info needed - no "see tech spec" references
2. **Copy schemas**: Include complete interface/type definitions in the description
3. **Exact paths**: Specify exact file paths, not "create a service"
4. **Method-level**: One task = one method or one small component
5. **Include code patterns**: Copy relevant code examples from the tech spec
6. **Specific tests**: Test cases with exact method names and scenarios
7. Each task completable in ONE coding session (max 3 files, excluding tests)
8. Use TS-XXX IDs (Technical Story)
9. Link to parent user stories via achievesUserStories when identifiable
10. Set all passes to false
11. Output ONLY JSON, no explanations

## CRITICAL: Compilable After Each Task

**Every task MUST leave the codebase in a compilable, working state.**

- Never create a task that breaks compilation (e.g., changing a method signature without updating callers)
- If a change affects multiple files, include ALL affected files in the same task
- If the task would be too large, find a different decomposition that maintains compilability
- Use these strategies when changes span many files:
  - **Add new alongside old**: Create new method/class, migrate callers one by one, then remove old
  - **Feature flags**: Add new behavior behind a flag, enable after all pieces are ready
  - **Interface extraction**: Add an interface first, then swap implementations
  - **Backwards compatible changes**: Add optional parameters instead of changing signatures

**BAD**: "TS-001: Change ConsoleInput.Read() signature" → leaves callers broken
**GOOD**: "TS-001: Add ConsoleInput.ReadWithOptions() alongside existing Read()" → both work

## Testing Requirements

- **Update existing tests**: If unit tests or integration tests already exist for modified code, update them
- **Add new tests**: Only add new test files if a test project/directory already exists in the codebase
- **Don't create test infrastructure**: Never create new test projects or testing frameworks from scratch
- **Test acceptance criteria**: Include specific test updates in acceptance criteria when applicable
`;
}

/**
 * Get the next US number based on existing PRD
 */
async function getNextUSNumber(project: Project, freshStart: boolean): Promise<number> {
  if (freshStart) {
    return 1;
  }

  const prd = await project.loadPRD();
  if (!prd?.userStories?.length) {
    return 1;
  }

  const maxNum = prd.userStories.reduce((max, story) => {
    const match = story.id.match(/US-(\d+)/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);

  return maxNum + 1;
}

import { extractReviewJson } from '../spec-review/json-parser.js';

/** Extract JSON from AI output (code blocks, raw JSON, or mixed prose). */
function extractJson(output: string): PRDData | null {
  return extractReviewJson<PRDData>(output);
}

/**
 * Run Claude for decomposition (no tools, just JSON output)
 */

interface ClaudeStreamOptions {
  prompt: string;
  cwd: string;
  logPath: string;
  /** Echo output to stdout (default: false) */
  echoOutput?: boolean;
  /** Show tool calls (default: false) */
  showToolCalls?: boolean;
}

interface ClaudeStreamResult {
  output: string;
  success: boolean;
}

/**
 * Execute Claude CLI with a prompt and stream output
 */
async function runClaudeWithPrompt(options: ClaudeStreamOptions): Promise<ClaudeStreamResult> {
  const { prompt, cwd, logPath, echoOutput = false, showToolCalls = false } = options;

  return new Promise((resolve) => {
    const claudePath = resolveCliPath('claude');

    const claude = spawn(claudePath, [
      '--dangerously-skip-permissions',
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--tools', '',
    ], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parserStream = new PassThrough();
    let fullOutput = '';

    claude.stdout.on('data', (chunk: Buffer) => {
      parserStream.write(chunk);
    });

    claude.stdout.on('end', () => {
      parserStream.end();
    });

    parseStream(parserStream, {
      onText: (text) => {
        fullOutput += text;
        if (echoOutput) {
          process.stdout.write(text);
        }
      },
      onToolCall: showToolCalls
        ? (name, detail) => console.log(`  ${name}: ${detail}`)
        : undefined,
    }).then(() => {
      fs.writeFile(logPath, fullOutput).catch(() => {});
    });

    claude.stdin.write(prompt);
    claude.stdin.end();

    let stderr = '';
    claude.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    claude.on('close', (code) => {
      if (echoOutput && code !== 0 && code !== 141) {
        console.error(chalk.red(`Claude exited with code ${code}`));
        if (stderr) console.error(stderr);
      }
      resolve({
        output: fullOutput,
        success: code === 0 || code === 141,
      });
    });

    claude.on('error', () => {
      resolve({
        output: '',
        success: false,
      });
    });
  });
}

async function runClaudeDecompose(
  prompt: string,
  cwd: string,
  logPath: string
): Promise<ClaudeStreamResult> {
  return runClaudeWithPrompt({
    prompt,
    cwd,
    logPath,
    echoOutput: true,
    showToolCalls: true,
  });
}

/**
 * Revise tasks based on peer review feedback using the engine abstraction
 */
async function reviseTasksWithFeedback(
  prdContent: string,
  currentTasks: PRDData,
  feedback: ReviewFeedback,
  project: Project,
  attempt: number,
  engineName?: string,
  model?: string
): Promise<PRDData | null> {
  const revisionPrompt = `You are revising a task decomposition based on peer review feedback.

## INSTRUCTIONS
1. Read the original PRD requirements
2. Review the current tasks JSON
3. Apply the reviewer's feedback to fix ALL issues
4. Apply task grouping suggestions (see below)
5. Output ONLY the corrected JSON - no explanations

## ORIGINAL PRD
<prd>
${prdContent}
</prd>

## CURRENT TASKS (needs revision)
<tasks>
${JSON.stringify(currentTasks, null, 2)}
</tasks>

## REVIEWER FEEDBACK
<feedback>
${JSON.stringify(feedback, null, 2)}
</feedback>

## REQUIREMENTS
- Fix ALL issues identified in the feedback (missingRequirements, contradictions, dependencyErrors, duplicates)
- Keep task IDs stable where possible (don't renumber unless necessary)
- Ensure all PRD requirements have corresponding tasks
- Ensure all dependencies reference valid task IDs
- Remove duplicate tasks

## TASK GROUPING (IMPORTANT)
If the feedback contains \`taskGroupings\`, you MUST combine those tasks:
- Merge the grouped task IDs into a SINGLE task
- Use the FIRST task ID in the group as the merged task's ID
- Combine acceptance criteria from all grouped tasks (remove duplicates)
- Combine test cases from all grouped tasks (remove duplicates)
- Update the title and description to reflect the combined scope
- Set complexity to the grouping's complexity value (usually "low")
- Update any tasks that depended on the removed task IDs to depend on the merged task ID
- DELETE the other tasks in the group (they are now part of the merged task)

Example: If taskGroupings contains {"taskIds": ["US-001", "US-002", "US-003"], "reason": "...", "complexity": "low"}
- Keep US-001, merge in acceptance criteria and tests from US-002 and US-003
- Delete US-002 and US-003 from the userStories array
- Update any task with dependencies: ["US-002"] to dependencies: ["US-001"]

## OUTPUT
Output ONLY valid JSON in the same format as the input tasks.
NO MARKDOWN, NO EXPLANATIONS.`;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const promptPath = join(project.logsDir, `revision_prompt_${attempt}_${timestamp}.md`);
  const logDir = project.logsDir;

  console.log(`  ${chalk.cyan('Revision log:')} ${logDir}`);

  // Write prompt to file for engine consumption
  await fs.writeFile(promptPath, revisionPrompt, 'utf-8');

  // Use engine abstraction with decompose purpose
  const sel = await selectEngine({ engineName, model, purpose: 'decompose' });
  const result = await sel.engine.runStream({
    promptPath,
    cwd: project.projectPath,
    logDir,
    iteration: attempt,
    model: sel.model,
  });

  return extractJson(result.output);
}

/**
 * Update decompose state and trigger progress callback.
 * Writes to per-spec location: .ralph/specs/<specId>/decompose_progress.json
 */
async function updateState(
  projectRoot: string,
  specId: string,
  state: Partial<DecomposeState>,
  onProgress?: (state: DecomposeState) => void
): Promise<void> {
  const current = await loadDecomposeStateForSpec(projectRoot, specId);
  const updated: DecomposeState = { ...current, ...state };
  await saveDecomposeStateForSpec(projectRoot, specId, updated);
  onProgress?.(updated);
}

/**
 * Log feedback issues in a standardized format
 */
function logFeedbackIssues(feedback: ReviewFeedback): void {
  console.log(chalk.yellow('  Issues found:'));
  const issues = [
    { items: feedback.missingRequirements, label: 'missing requirements' },
    { items: feedback.contradictions, label: 'contradictions' },
    { items: feedback.dependencyErrors, label: 'dependency errors' },
    { items: feedback.duplicates, label: 'duplicates' },
  ];

  issues.forEach(({ items, label }) => {
    if (items?.length) {
      console.log(chalk.yellow(`    - ${items.length} ${label}`));
    }
  });
}

/**
 * Print a formatted section header
 */
function logSection(title: string, divider = true): void {
  console.log('');
  console.log(chalk.green('============================================'));
  console.log(chalk.green(`  ${title}`));
  console.log(chalk.green('============================================'));
  if (divider) {
    console.log('');
  }
}

/**
 * Print labeled info line
 */
function logInfo(label: string, value: string | number): void {
  console.log(`  ${chalk.cyan(label + ':')} ${' '.repeat(Math.max(0, 15 - label.length))}${value}`);
}

/**
 * Run PRD decomposition
 */
export async function runDecompose(
  project: Project,
  options: DecomposeOptions
): Promise<DecomposeResult> {
  const {
    prdFile,
    branchName = 'main',
    language,
    outputName,
    freshStart = false,
    forceRedecompose = false,
    enablePeerReview = true,  // Enabled by default - uses CLI from settings
    maxReviewAttempts = parseInt(process.env.RALPH_MAX_REVIEW_ATTEMPTS || '3', 10),
    reviewTimeoutMs,
    onProgress,
  } = options;

  // Validate PRD file exists
  try {
    await fs.access(prdFile);
  } catch {
    return {
      success: false,
      storyCount: 0,
      error: `PRD file not found: ${prdFile}`,
    };
  }

  // Derive spec ID and output path (spec-partitioned)
  const specId = extractSpecId(prdFile);
  const specDir = await ensureSpecDir(project.projectPath, specId);
  const finalOutputName = outputName || 'decompose_state.json';
  const outputPath = join(specDir, finalOutputName);

  // Initialize spec metadata if not exists
  const existingMetadata = await readSpecMetadata(project.projectPath, specId);
  if (!existingMetadata) {
    await initSpecMetadata(project.projectPath, prdFile);
  }

  // Read PRD content
  const prdContent = await fs.readFile(prdFile, 'utf-8');
  const prdSize = Buffer.byteLength(prdContent);
  const prdLines = prdContent.split('\n').length;

  logSection('Qala Spec Decomposer');
  logInfo('Spec File', prdFile);
  logInfo('Spec Size', `${prdSize} bytes, ${prdLines} lines`);
  logInfo('Branch', branchName);
  logInfo('Output', outputPath);
  if (language) {
    logInfo('Language', language);
  }
  console.log('');

  // Update state
  await updateState(project.projectPath, specId, {
    status: 'INITIALIZING',
    message: 'Reading PRD file',
    prdFile,
    startedAt: new Date().toISOString(),
  }, onProgress);

  // Check for existing draft
  let skipDecomposition = false;
  let existingPrd: PRDData | null = null;

  if (forceRedecompose) {
    try {
      await fs.unlink(outputPath);
      console.log(chalk.yellow('Force re-decomposition: removed existing draft'));
    } catch {
      // File doesn't exist
    }
  } else {
    try {
      const existingContent = await fs.readFile(outputPath, 'utf-8');
      existingPrd = JSON.parse(existingContent) as PRDData;
      if (existingPrd.userStories && existingPrd.userStories.length > 0) {
        console.log(chalk.yellow('============================================'));
        console.log(chalk.yellow(`  Existing draft found: ${outputPath}`));
        console.log(chalk.yellow(`  Contains ${existingPrd.userStories.length} tasks`));
        console.log(chalk.yellow('  Skipping decomposition, using existing draft'));
        console.log(chalk.yellow('  (Use --redecompose to force re-decomposition)'));
        console.log(chalk.yellow('============================================'));
        console.log('');
        skipDecomposition = true;
      }
    } catch {
      // No existing draft
    }
  }

  let prd: PRDData;

  if (skipDecomposition && existingPrd) {
    prd = existingPrd;
    await updateState(project.projectPath, specId, {
      status: 'DECOMPOSED',
      message: `Using existing draft with ${prd.userStories.length} tasks`,
      draftFile: outputPath,
    }, onProgress);
  } else {
    // Detect spec type to use appropriate prompt
    const specTypeInfo = await detectSpecType(prdFile, prdContent);
    const isTechSpec = specTypeInfo.type === 'tech-spec';

    // Get decompose prompt template based on spec type
    let promptTemplate: string;
    if (isTechSpec) {
      promptTemplate = getTechSpecDecomposePrompt();
      console.log(chalk.cyan('  Detected: Tech Spec - generating implementation tasks'));
    } else {
      promptTemplate = await getDecomposePrompt(project);
      console.log(chalk.cyan('  Detected: PRD - generating user stories'));
    }

    // Get next task number (US for PRD, TS for tech spec)
    const taskPrefix = isTechSpec ? 'TS' : 'US';
    const nextUSNumber = await getNextUSNumber(project, freshStart);
    if (nextUSNumber > 1) {
      console.log(`  ${chalk.cyan('Continuing from:')} ${taskPrefix}-${String(nextUSNumber).padStart(3, '0')}`);
    }

    // Build full prompt
    let fullPrompt = promptTemplate;
    fullPrompt += `\n\n## Branch Name\n${branchName}`;

    if (nextUSNumber > 1) {
      fullPrompt += `\n\n## IMPORTANT: Task Numbering\nStart task IDs from ${taskPrefix}-${String(nextUSNumber).padStart(3, '0')} (continuing from existing tasks).\nDo NOT start from ${taskPrefix}-001.`;
    }

    if (language) {
      fullPrompt += `\n\n## Language\n${language}\n\nUse this for the \`language\` and \`standardsFile\` fields in the JSON output.`;
    }

    // Use appropriate content tag based on spec type
    const contentTag = isTechSpec ? 'tech-spec' : 'prd';
    fullPrompt += `\n\n## ${isTechSpec ? 'Tech Spec' : 'PRD'} Content\n\n<${contentTag}>\n${prdContent}\n</${contentTag}>`;

    // Create log file in spec logs directory
    const specLogsDir = getSpecLogsDir(project.projectPath, specId);
    await fs.mkdir(specLogsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(specLogsDir, `decompose_${timestamp}.log`);

    console.log(chalk.yellow('Starting engine...'));
    console.log(chalk.blue('(This may take 1-3 minutes for large PRDs)'));
    console.log('');
    console.log(chalk.cyan('─────────────────────────────────────────────'));
    console.log(chalk.cyan('Claude Output:'));
    console.log(chalk.cyan('─────────────────────────────────────────────'));

    await updateState(project.projectPath, specId, {
      status: 'DECOMPOSING',
      message: isTechSpec ? 'Engine is generating implementation tasks from tech spec' : 'Engine is generating user stories from PRD',
    }, onProgress);

    // Write full prompt to a temp file used by the engine
    const promptPath = join(specLogsDir, `decompose_prompt_${timestamp}.md`);
    await fs.writeFile(promptPath, fullPrompt, 'utf-8');

    const startTime = Date.now();
    const sel = await selectEngine({ engineName: options.engineName, model: options.model, purpose: 'decompose' });
    const result = await sel.engine.runStream({
      promptPath,
      cwd: project.projectPath,
      logDir: specLogsDir,
      iteration: 0,
      model: sel.model,
      callbacks: options.streamCallbacks,
    });
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log('');
    console.log(chalk.cyan('─────────────────────────────────────────────'));
    console.log(`  ${chalk.cyan('Time elapsed:')} ${elapsed} seconds`);

    if (!result.success) {
      await updateState(project.projectPath, specId, {
        status: 'ERROR',
        message: 'Engine failed to generate tasks',
        error: 'Engine error',
      }, onProgress);
      return {
        success: false,
        storyCount: 0,
        error: 'Engine error',
      };
    }

    // Extract JSON from output
    const extracted = extractJson(result.output);
    if (!extracted) {
      await updateState(project.projectPath, specId, {
        status: 'ERROR',
        message: 'Could not extract JSON from engine output',
        error: 'JSON extraction failed',
      }, onProgress);
      return {
        success: false,
        storyCount: 0,
        error: 'Could not extract JSON from engine output. Check logs in: ' + specLogsDir,
      };
    }

    prd = extracted;

    // Ensure required fields
    prd.branchName = prd.branchName || branchName;
    prd.language = prd.language || language || 'nodejs';
    prd.standardsFile = prd.standardsFile || `.ralph/standards/${prd.language}.md`;

    // Save the draft
    await fs.writeFile(outputPath, JSON.stringify(prd, null, 2));

    await updateState(project.projectPath, specId, {
      status: 'DECOMPOSED',
      message: `Generated ${prd.userStories.length} tasks`,
      draftFile: outputPath,
    }, onProgress);
  }

  // Peer review - reviews ALL tasks together, revises if needed
  let verdict: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED' = 'SKIPPED';
  let reviewAttempt = 1;

  if (enablePeerReview) {
    // Get timeout using spec-review timeout logic (CLI flag > env var > default)
    const timeoutMs = getReviewTimeout(reviewTimeoutMs);

    console.log('');
    console.log(chalk.cyan('============================================'));
    console.log(chalk.cyan('  Running Decompose Review'));
    console.log(chalk.cyan('============================================'));
    console.log(`  ${chalk.cyan('Timeout:')}    ${timeoutMs}ms`);

    while (reviewAttempt <= maxReviewAttempts) {
      await updateState(project.projectPath, specId, {
        status: 'REVIEWING',
        message: `Running decompose review (attempt ${reviewAttempt}/${maxReviewAttempts})...`,
        draftFile: outputPath,
      }, onProgress);

      const tasksJson = JSON.stringify(prd, null, 2);
      // Use per-spec logs directory for review logs
      const reviewLogsDir = getSpecLogsDir(project.projectPath, specId);
      await fs.mkdir(reviewLogsDir, { recursive: true });

      const feedback = await runDecomposeReview(prdContent, tasksJson, {
        timeoutMs,
        cwd: project.projectPath,
        logDir: reviewLogsDir,
      });

      verdict = feedback.verdict;

      console.log('');
      console.log(`  ${chalk.cyan('Review attempt:')} ${reviewAttempt}/${maxReviewAttempts}`);
      console.log(`  ${chalk.cyan('Verdict:')} ${verdict === 'PASS' ? chalk.green(verdict) : chalk.red(verdict)}`);

      if (verdict === 'PASS') {
        console.log(chalk.green('  ✓ Decompose review passed!'));
        break;
      } else if (verdict === 'FAIL' && reviewAttempt < maxReviewAttempts) {
        // Show issues from feedback
        logFeedbackIssues(feedback);

        // Send feedback to Claude for revision
        console.log('');
        console.log(chalk.yellow('Sending feedback to Claude for revision...'));

        await updateState(project.projectPath, specId, {
          status: 'REVISING',
          message: `Claude is revising tasks based on review feedback (attempt ${reviewAttempt})`,
          draftFile: outputPath,
        }, onProgress);

        const revisedPrd = await reviseTasksWithFeedback(
          prdContent,
          prd,
          feedback,
          project,
          reviewAttempt,
          options.engineName,
          options.model
        );

        if (revisedPrd) {
          prd = revisedPrd;
          // Save revised tasks
          await fs.writeFile(outputPath, JSON.stringify(prd, null, 2));
          console.log(chalk.green(`  ✓ Revision complete - ${prd.userStories.length} tasks`));
        } else {
          console.log(chalk.red('  Could not extract valid JSON from revision'));
          console.log(chalk.yellow('  Continuing with current tasks...'));
        }
      } else {
        console.log(chalk.yellow(`  ⚠ Review verdict: ${verdict}`));
        break;
      }

      reviewAttempt++;
    }

    // Set reviewStatus on each story based on review verdict
    const reviewStatus = verdict === 'PASS' ? 'passed' : 'needs_improvement';
    prd.userStories = prd.userStories.map(story => ({
      ...story,
      reviewStatus: reviewStatus as 'passed' | 'needs_improvement' | 'pending',
    }));

    // Save updated stories with review status
    await fs.writeFile(outputPath, JSON.stringify(prd, null, 2));

    await updateState(project.projectPath, specId, {
      status: 'COMPLETED',
      message: `Decompose review complete: ${verdict}`,
      verdict,
      draftFile: outputPath,
    }, onProgress);
  } else {
    // Review skipped - set stories to pending
    prd.userStories = prd.userStories.map(story => ({
      ...story,
      reviewStatus: 'pending' as const,
    }));

    // Save updated stories with pending status
    await fs.writeFile(outputPath, JSON.stringify(prd, null, 2));
  }

  await updateState(project.projectPath, specId, {
    status: 'COMPLETED',
    message: 'Decomposition complete',
    verdict,
    draftFile: outputPath,
  }, onProgress);

  // Transition spec status to 'decomposed' on success
  try {
    await updateSpecStatus(project.projectPath, specId, 'decomposed');
  } catch (error) {
    // Status transition may fail if already decomposed (e.g., using existing draft)
    // This is not fatal - log and continue
    console.log(chalk.yellow(`  Note: ${(error as Error).message}`));
  }

  // Summary
  logSection('Decomposition Complete!');
  logInfo('Project', prd.projectName);
  logInfo('Stories created', prd.userStories.length.toString());
  logInfo('Output file', outputPath);
  console.log('');

  // Show first few stories
  console.log(chalk.cyan('Stories preview:'));
  const preview = prd.userStories.slice(0, 5);
  for (const story of preview) {
    console.log(`  ${story.id}: ${story.title} (priority: ${story.priority})`);
  }
  if (prd.userStories.length > 5) {
    console.log(`  ... and ${prd.userStories.length - 5} more`);
  }

  console.log('');
  console.log(chalk.yellow('Next steps:'));
  console.log(`  1. Review tasks: cat ${outputPath}`);
  console.log(`  2. Activate tasks: qala activate ${finalOutputName}`);
  console.log(`  3. Start Ralph: qala start`);
  console.log('');

  return {
    success: true,
    prd,
    outputPath,
    storyCount: prd.userStories.length,
    verdict,
  };
}
