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
import { getReviewTimeout } from '../spec-review/timeout.js';
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

/**
 * Extract JSON from Claude's output
 */
function extractJson(output: string): PRDData | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as PRDData;
    } catch {
      // Continue to other methods
    }
  }

  // Try to find raw JSON starting with {
  const jsonStart = output.indexOf('{');
  if (jsonStart !== -1) {
    // Find matching closing brace
    let depth = 0;
    for (let i = jsonStart; i < output.length; i++) {
      if (output[i] === '{') depth++;
      else if (output[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const jsonStr = output.substring(jsonStart, i + 1);
            const parsed = JSON.parse(jsonStr) as PRDData;
            if (parsed.userStories) {
              return parsed;
            }
          } catch {
            // Continue searching
          }
        }
      }
    }
  }

  return null;
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
 * Revise tasks based on peer review feedback
 */
async function reviseTasksWithFeedback(
  prdContent: string,
  currentTasks: PRDData,
  feedback: ReviewFeedback,
  project: Project,
  attempt: number
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
  const logPath = join(project.logsDir, `revision_attempt_${attempt}_${timestamp}.log`);

  console.log(`  ${chalk.cyan('Revision log:')} ${logPath}`);

  const result = await runClaudeWithPrompt({
    prompt: revisionPrompt,
    cwd: project.projectPath,
    logPath,
    echoOutput: false,
    showToolCalls: false,
  });

  return extractJson(result.output);
}

/**
 * Update decompose state
 */
async function updateState(
  project: Project,
  state: Partial<DecomposeState>,
  onProgress?: (state: DecomposeState) => void
): Promise<void> {
  const current = await project.loadDecomposeState();
  const updated: DecomposeState = {
    ...current,
    ...state,
  };
  await project.saveDecomposeState(updated);
  onProgress?.(updated);
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

  // Derive output name
  const prdBasename = basename(prdFile);
  const finalOutputName = outputName || prdBasename.replace(/\.[^.]+$/, '.json');
  const outputPath = join(project.tasksDir, finalOutputName);

  // Read PRD content
  const prdContent = await fs.readFile(prdFile, 'utf-8');
  const prdSize = Buffer.byteLength(prdContent);
  const prdLines = prdContent.split('\n').length;

  console.log('');
  console.log(chalk.green('============================================'));
  console.log(chalk.green('  Qala PRD Decomposer'));
  console.log(chalk.green('============================================'));
  console.log('');
  console.log(`  ${chalk.cyan('PRD File:')}    ${prdFile}`);
  console.log(`  ${chalk.cyan('PRD Size:')}    ${prdSize} bytes, ${prdLines} lines`);
  console.log(`  ${chalk.cyan('Branch:')}      ${branchName}`);
  console.log(`  ${chalk.cyan('Output:')}      ${outputPath}`);
  if (language) {
    console.log(`  ${chalk.cyan('Language:')}    ${language}`);
  }
  console.log('');

  // Update state
  await updateState(project, {
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
    await updateState(project, {
      status: 'DECOMPOSED',
      message: `Using existing draft with ${prd.userStories.length} tasks`,
      draftFile: outputPath,
    }, onProgress);
  } else {
    // Get decompose prompt template
    const promptTemplate = await getDecomposePrompt(project);

    // Get next US number
    const nextUSNumber = await getNextUSNumber(project, freshStart);
    if (nextUSNumber > 1) {
      console.log(`  ${chalk.cyan('Continuing from:')} US-${String(nextUSNumber).padStart(3, '0')}`);
    }

    // Build full prompt
    let fullPrompt = promptTemplate;
    fullPrompt += `\n\n## Branch Name\n${branchName}`;

    if (nextUSNumber > 1) {
      fullPrompt += `\n\n## IMPORTANT: Story Numbering\nStart story IDs from US-${String(nextUSNumber).padStart(3, '0')} (continuing from existing stories).\nDo NOT start from US-001.`;
    }

    if (language) {
      fullPrompt += `\n\n## Language\n${language}\n\nUse this for the \`language\` and \`standardsFile\` fields in the JSON output.`;
    }

    fullPrompt += `\n\n## PRD Content\n\n<prd>\n${prdContent}\n</prd>`;

    // Create log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(project.logsDir, `decompose_${timestamp}.log`);

    console.log(chalk.yellow('Starting Claude CLI...'));
    console.log(chalk.blue('(This may take 1-3 minutes for large PRDs)'));
    console.log('');
    console.log(chalk.cyan('─────────────────────────────────────────────'));
    console.log(chalk.cyan('Claude Output:'));
    console.log(chalk.cyan('─────────────────────────────────────────────'));

    await updateState(project, {
      status: 'DECOMPOSING',
      message: 'Claude is generating tasks from PRD',
    }, onProgress);

    const startTime = Date.now();
    const result = await runClaudeDecompose(fullPrompt, project.projectPath, logPath);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log('');
    console.log(chalk.cyan('─────────────────────────────────────────────'));
    console.log(`  ${chalk.cyan('Time elapsed:')} ${elapsed} seconds`);

    if (!result.success) {
      await updateState(project, {
        status: 'ERROR',
        message: 'Claude failed to generate tasks',
        error: 'Claude CLI error',
      }, onProgress);
      return {
        success: false,
        storyCount: 0,
        error: 'Claude CLI error',
      };
    }

    // Extract JSON from output
    const extracted = extractJson(result.output);
    if (!extracted) {
      await updateState(project, {
        status: 'ERROR',
        message: 'Could not extract JSON from Claude response',
        error: 'JSON extraction failed',
      }, onProgress);
      return {
        success: false,
        storyCount: 0,
        error: 'Could not extract JSON from Claude response. Check log file: ' + logPath,
      };
    }

    prd = extracted;

    // Ensure required fields
    prd.branchName = prd.branchName || branchName;
    prd.language = prd.language || language || 'nodejs';
    prd.standardsFile = prd.standardsFile || `.ralph/standards/${prd.language}.md`;

    // Save the draft
    await fs.writeFile(outputPath, JSON.stringify(prd, null, 2));

    await updateState(project, {
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
      await updateState(project, {
        status: 'REVIEWING',
        message: `Running decompose review (attempt ${reviewAttempt}/${maxReviewAttempts})...`,
        draftFile: outputPath,
      }, onProgress);

      const tasksJson = JSON.stringify(prd, null, 2);
      const feedback = await runDecomposeReview(prdContent, tasksJson, {
        timeoutMs,
        cwd: project.projectPath,
        logDir: project.logsDir,
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
        console.log(chalk.yellow('  Issues found:'));
        if (feedback.missingRequirements?.length) {
          console.log(chalk.yellow(`    - ${feedback.missingRequirements.length} missing requirements`));
        }
        if (feedback.contradictions?.length) {
          console.log(chalk.yellow(`    - ${feedback.contradictions.length} contradictions`));
        }
        if (feedback.dependencyErrors?.length) {
          console.log(chalk.yellow(`    - ${feedback.dependencyErrors.length} dependency errors`));
        }
        if (feedback.duplicates?.length) {
          console.log(chalk.yellow(`    - ${feedback.duplicates.length} duplicates`));
        }

        // Send feedback to Claude for revision
        console.log('');
        console.log(chalk.yellow('Sending feedback to Claude for revision...'));

        await updateState(project, {
          status: 'REVISING',
          message: `Claude is revising tasks based on review feedback (attempt ${reviewAttempt})`,
          draftFile: outputPath,
        }, onProgress);

        const revisedPrd = await reviseTasksWithFeedback(
          prdContent,
          prd,
          feedback,
          project,
          reviewAttempt
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

    await updateState(project, {
      status: 'COMPLETED',
      message: `Decompose review complete: ${verdict}`,
      verdict,
      draftFile: outputPath,
    }, onProgress);
  }

  await updateState(project, {
    status: 'COMPLETED',
    message: 'Decomposition complete',
    verdict,
    draftFile: outputPath,
  }, onProgress);

  // Summary
  console.log('');
  console.log(chalk.green('============================================'));
  console.log(chalk.green('  Decomposition Complete!'));
  console.log(chalk.green('============================================'));
  console.log('');
  console.log(`  ${chalk.cyan('Project:')}         ${prd.projectName}`);
  console.log(`  ${chalk.cyan('Stories created:')} ${prd.userStories.length}`);
  console.log(`  ${chalk.cyan('Output file:')}     ${outputPath}`);
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
