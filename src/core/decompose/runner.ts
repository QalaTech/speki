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
import { parseStream, createConsoleCallbacks } from '../claude/stream-parser.js';
import { PassThrough } from 'stream';
import { runPeerReview, ReviewFeedback } from './peer-review.js';
import { loadGlobalSettings } from '../settings.js';
import { resolveCliPath } from '../cli-path.js';
import type { PRDData, DecomposeState } from '../../types/index.js';

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
  if (!prd || !prd.userStories || prd.userStories.length === 0) {
    return 1;
  }

  let maxNum = 0;
  for (const story of prd.userStories) {
    const match = story.id.match(/US-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

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
async function runClaudeDecompose(
  prompt: string,
  cwd: string,
  logPath: string
): Promise<{ output: string; success: boolean }> {
  return new Promise((resolve) => {
    // Resolve the Claude CLI path - handles cases where claude is an alias not in PATH
    const claudePath = resolveCliPath('claude');

    const claude = spawn(claudePath, [
      '--dangerously-skip-permissions',
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--tools', '',  // Disable all tools
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

    // Parse the stream to extract text
    parseStream(parserStream, {
      onText: (text) => {
        fullOutput += text;
        process.stdout.write(text);
      },
      onToolCall: (name, detail) => {
        console.log(`  🔧 ${name}: ${detail}`);
      },
    }).then(() => {
      // Write output to log
      fs.writeFile(logPath, fullOutput).catch(() => {});
    });

    // Send prompt
    claude.stdin.write(prompt);
    claude.stdin.end();

    // Capture stderr
    let stderr = '';
    claude.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    claude.on('close', (code) => {
      if (code !== 0 && code !== 141) {
        console.error(chalk.red(`Claude exited with code ${code}`));
        if (stderr) console.error(stderr);
      }
      resolve({
        output: fullOutput,
        success: code === 0 || code === 141,
      });
    });

    claude.on('error', (err) => {
      resolve({
        output: '',
        success: false,
      });
    });
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
4. Output ONLY the corrected JSON - no explanations

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
- Fix ALL issues identified in the feedback
- Keep task IDs stable where possible (don't renumber unless necessary)
- Ensure all PRD requirements have corresponding tasks
- Ensure all dependencies reference valid task IDs
- Remove duplicate tasks
- Output ONLY valid JSON in the same format as the input tasks

OUTPUT THE CORRECTED JSON ONLY. NO MARKDOWN, NO EXPLANATIONS.`;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join(project.logsDir, `revision_attempt_${attempt}_${timestamp}.log`);

  console.log(`  ${chalk.cyan('Revision log:')} ${logPath}`);

  return new Promise((resolve) => {
    // Resolve the Claude CLI path - handles cases where claude is an alias not in PATH
    const claudePath = resolveCliPath('claude');

    const claude = spawn(claudePath, [
      '--dangerously-skip-permissions',
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--tools', '',
    ], {
      cwd: project.projectPath,
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
        // Don't echo revision output - keep it clean
      },
    }).then(() => {
      fs.writeFile(logPath, fullOutput).catch(() => {});
    });

    claude.stdin.write(revisionPrompt);
    claude.stdin.end();

    claude.on('close', () => {
      // Extract JSON from revision output
      const extracted = extractJson(fullOutput);
      resolve(extracted);
    });

    claude.on('error', () => {
      resolve(null);
    });
  });
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
    // Load settings to get selected reviewer CLI name
    const settings = await loadGlobalSettings();
    const reviewerCliName = settings.reviewer.cli.charAt(0).toUpperCase() + settings.reviewer.cli.slice(1);

    console.log('');
    console.log(chalk.cyan('============================================'));
    console.log(chalk.cyan(`  Running ${reviewerCliName} Peer Review`));
    console.log(chalk.cyan('============================================'));

    while (reviewAttempt <= maxReviewAttempts) {
      await updateState(project, {
        status: 'REVIEWING',
        message: `Running ${reviewerCliName} peer review (attempt ${reviewAttempt}/${maxReviewAttempts})...`,
        draftFile: outputPath,
      }, onProgress);

      const reviewResult = await runPeerReview({
        prdFile,
        tasks: prd,
        project,
        attempt: reviewAttempt,
      });

      verdict = reviewResult.feedback.verdict;

      console.log('');
      console.log(`  ${chalk.cyan('Review attempt:')} ${reviewAttempt}/${maxReviewAttempts}`);
      console.log(`  ${chalk.cyan('Verdict:')} ${verdict === 'PASS' ? chalk.green(verdict) : verdict === 'FAIL' ? chalk.red(verdict) : chalk.yellow(verdict)}`);
      console.log(`  ${chalk.cyan('Log:')} ${reviewResult.logPath}`);

      if (verdict === 'PASS') {
        console.log(chalk.green('  ✓ Peer review passed!'));
        break;
      } else if (verdict === 'FAIL' && reviewAttempt < maxReviewAttempts) {
        // Show issues from feedback
        console.log(chalk.yellow('  Issues found:'));
        const fb = reviewResult.feedback;
        if (fb.missingRequirements?.length) {
          console.log(chalk.yellow(`    - ${fb.missingRequirements.length} missing requirements`));
        }
        if (fb.contradictions?.length) {
          console.log(chalk.yellow(`    - ${fb.contradictions.length} contradictions`));
        }
        if (fb.dependencyErrors?.length) {
          console.log(chalk.yellow(`    - ${fb.dependencyErrors.length} dependency errors`));
        }
        if (fb.duplicates?.length) {
          console.log(chalk.yellow(`    - ${fb.duplicates.length} duplicates`));
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
          reviewResult.feedback,
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
      message: `Peer review complete: ${verdict}`,
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
