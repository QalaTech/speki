/**
 * Decomposition Peer Review
 *
 * Uses configurable CLI (Codex or Claude) to compare the source PRD with the decomposed tasks JSON.
 * Returns PASS/FAIL verdict without modifying the tasks.
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { Project } from '../project.js';
import type { PRDData, ReviewFeedback as TypedReviewFeedback, CliType } from '../../types/index.js';
import { loadGlobalSettings } from '../settings.js';
import { detectCli, detectAllClis } from '../cli-detect.js';

/** Timeout for Claude CLI execution in milliseconds (5 minutes) */
export const CLAUDE_TIMEOUT_MS = 300000;

/** Timeout for Codex CLI execution in milliseconds (5 minutes) */
export const CODEX_TIMEOUT_MS = 300000;

export interface ReviewFeedback {
  verdict: 'PASS' | 'FAIL' | 'UNKNOWN';
  missingRequirements?: Array<{
    requirement?: string;
    prdSection?: string;
  }>;
  contradictions?: Array<{
    taskId?: string;
    issue?: string;
    prdSection?: string;
  }>;
  dependencyErrors?: Array<{
    taskId?: string;
    issue?: string;
    dependsOn?: string;
  }>;
  duplicates?: Array<{
    taskIds?: string[];
    reason?: string;
  }>;
  suggestions?: Array<{
    taskId?: string;
    action?: string;
  }>;
  issues?: string[];
  reviewLog?: string;
}

export interface PeerReviewOptions {
  /** Path to the PRD markdown file */
  prdFile: string;
  /** Generated tasks PRD data */
  tasks: PRDData;
  /** Project instance for paths */
  project: Project;
  /** Review attempt number (for log naming) */
  attempt?: number;
}

export interface PeerReviewResult {
  /** Whether the review completed successfully */
  success: boolean;
  /** The review feedback */
  feedback: ReviewFeedback;
  /** Path to the review log file */
  logPath: string;
  /** Error message if failed */
  error?: string;
  /** Which CLI was used for the review */
  cli?: CliType;
}

export interface ClaudeReviewResult {
  /** Whether the review completed successfully */
  success: boolean;
  /** The review feedback (typed schema from types/index.ts) */
  feedback: TypedReviewFeedback;
  /** Error message if failed */
  error?: string;
  /** Captured stdout output (raw response) */
  stdout?: string;
  /** Captured stderr output */
  stderr?: string;
}

export interface ClaudeReviewOptions {
  /** The prompt to send to Claude */
  prompt: string;
  /** Path to write raw output file */
  outputPath: string;
  /** Project path for working directory context */
  projectPath: string;
}

export interface AutoSelectResult {
  /** Whether auto-selection succeeded */
  success: boolean;
  /** The selected CLI (if successful) */
  cli?: CliType;
  /** Error message if failed */
  error?: string;
}

/**
 * Auto-select an available CLI when no settings are configured.
 * Priority: Codex first (backwards compatible), then Claude.
 *
 * @returns AutoSelectResult with selected CLI or error
 */
export async function autoSelectCli(): Promise<AutoSelectResult> {
  const detection = await detectAllClis();

  // Prefer Codex for backwards compatibility
  if (detection.codex.available) {
    return {
      success: true,
      cli: 'codex',
    };
  }

  // Fall back to Claude if only Claude is available
  if (detection.claude.available) {
    return {
      success: true,
      cli: 'claude',
    };
  }

  // Neither CLI is available
  return {
    success: false,
    error: 'No CLI tools available. Please install Codex or Claude CLI.',
  };
}

/**
 * Run peer review using Claude CLI
 *
 * Spawns 'claude --print --output-format text' with prompt on stdin.
 * Captures stdout as response and writes raw output to specified file path.
 * Enforces 5-minute timeout.
 *
 * @throws Error with stderr message on non-zero exit or timeout
 */
export async function runWithClaude(options: ClaudeReviewOptions): Promise<ClaudeReviewResult> {
  const { prompt, outputPath, projectPath } = options;

  console.log(`  [DEBUG] runWithClaude called with prompt length: ${prompt.length}, projectPath: ${projectPath}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let processExited = false;

    console.log(`  [DEBUG] Spawning Claude CLI...`);
    // Use same flags as decompose runner for consistent Claude CLI behavior
    const claude: ChildProcess = spawn('claude', [
      '--dangerously-skip-permissions',  // Required for non-interactive mode
      '--print',
      '--output-format', 'text',
      '--tools', '',  // Disable all tools - peer review is pure text analysis
    ], {
      cwd: projectPath,  // Set working directory for proper context
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!processExited) {
        timedOut = true;
        claude.kill('SIGTERM');
        // Force kill after 5 seconds if SIGTERM didn't work
        setTimeout(() => {
          if (!processExited) {
            claude.kill('SIGKILL');
          }
        }, 5000);
      }
    }, CLAUDE_TIMEOUT_MS);

    claude.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    claude.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Send prompt to stdin
    claude.stdin?.write(prompt);
    claude.stdin?.end();

    claude.on('close', async (code) => {
      processExited = true;
      clearTimeout(timeoutId);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  [DEBUG] Claude closed after ${elapsed}s, exit code: ${code}, stdout length: ${stdout.length}`);

      // Write raw output to file
      try {
        await fs.writeFile(outputPath, stdout);
      } catch (writeError) {
        // If we can't write the file, continue but note the error
        stderr += `\nFailed to write output file: ${writeError}`;
      }

      // Handle timeout
      if (timedOut) {
        reject(new Error(`Claude CLI timed out after ${CLAUDE_TIMEOUT_MS / 1000} seconds. Stderr: ${stderr}`));
        return;
      }

      // Handle non-zero exit
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}. Stderr: ${stderr}`));
        return;
      }

      // Parse the response as ReviewFeedback JSON
      try {
        const feedback = parseClaudeResponse(stdout);
        resolve({
          success: true,
          feedback,
          stdout,
          stderr,
        });
      } catch (parseError) {
        reject(new Error(`Failed to parse Claude response as ReviewFeedback JSON: ${parseError}. Raw output: ${stdout.substring(0, 500)}`));
      }
    });

    claude.on('error', (err) => {
      processExited = true;
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}. Stderr: ${stderr}`));
    });
  });
}

/**
 * Parse Claude response to extract ReviewFeedback JSON
 */
function parseClaudeResponse(output: string): TypedReviewFeedback {
  const trimmed = output.trim();

  // Try direct parse first
  try {
    const parsed = JSON.parse(trimmed);
    return validateReviewFeedback(parsed);
  } catch (err) {
    // If it's a validation error (parsed JSON but invalid schema), rethrow
    if (err instanceof Error && err.message.includes('verdict')) {
      throw err;
    }
    // Continue to other methods for parse errors
  }

  // Try to find JSON in markdown code blocks
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      return validateReviewFeedback(parsed);
    } catch (err) {
      // If it's a validation error, rethrow
      if (err instanceof Error && err.message.includes('verdict')) {
        throw err;
      }
      // Continue for parse errors
    }
  }

  // Try to find any JSON object by matching braces
  let start = trimmed.indexOf('{');
  while (start !== -1) {
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++;
      else if (trimmed[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(trimmed.substring(start, i + 1));
            return validateReviewFeedback(parsed);
          } catch (err) {
            // If it's a validation error, rethrow
            if (err instanceof Error && err.message.includes('verdict')) {
              throw err;
            }
            // Continue searching for parse errors
          }
          break;
        }
      }
    }
    start = trimmed.indexOf('{', start + 1);
  }

  throw new Error('No valid ReviewFeedback JSON found in output');
}

/**
 * Validate and normalize parsed JSON to ReviewFeedback schema
 */
function validateReviewFeedback(obj: unknown): TypedReviewFeedback {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Response is not an object');
  }

  const data = obj as Record<string, unknown>;

  // Validate verdict
  if (data.verdict !== 'PASS' && data.verdict !== 'FAIL') {
    throw new Error(`Invalid verdict: ${data.verdict}. Must be 'PASS' or 'FAIL'`);
  }

  // Helper to convert item to string - handles both string and object formats
  const itemToString = (item: unknown): string => {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      // Build a readable string from object properties
      const parts: string[] = [];
      if (obj.taskId) parts.push(`[${obj.taskId}]`);
      if (obj.taskIds && Array.isArray(obj.taskIds)) parts.push(`[${obj.taskIds.join(', ')}]`);
      if (obj.requirement) parts.push(String(obj.requirement));
      if (obj.issue) parts.push(String(obj.issue));
      if (obj.reason) parts.push(String(obj.reason));
      if (obj.action) parts.push(String(obj.action));
      if (obj.prdSection) parts.push(`(PRD: ${obj.prdSection})`);
      if (obj.dependsOn) parts.push(`(depends on: ${obj.dependsOn})`);
      return parts.join(' ') || JSON.stringify(item);
    }
    return String(item);
  };

  // Build validated feedback with defaults for optional arrays
  const feedback: TypedReviewFeedback = {
    verdict: data.verdict,
    missingRequirements: Array.isArray(data.missingRequirements)
      ? data.missingRequirements.map(itemToString)
      : [],
    contradictions: Array.isArray(data.contradictions)
      ? data.contradictions.map(itemToString)
      : [],
    dependencyErrors: Array.isArray(data.dependencyErrors)
      ? data.dependencyErrors.map(itemToString)
      : [],
    duplicates: Array.isArray(data.duplicates)
      ? data.duplicates.map(itemToString)
      : [],
    suggestions: Array.isArray(data.suggestions)
      ? data.suggestions.map(itemToString)
      : [],
  };

  return feedback;
}

/**
 * Build the review prompt
 */
function buildReviewPrompt(prdText: string, tasksJson: string): string {
  return `YOU ARE A DOCUMENT REVIEWER ONLY.

DO NOT:
- Generate any code
- Make any code changes
- Use any tools
- Execute any commands
- Give implementation suggestions

YOUR ONLY TASK: Compare the PRD document to the Tasks JSON and output a verdict.

## OUTPUT FORMAT
Reply with ONLY valid JSON in this EXACT structure (all arrays contain STRINGS, not objects):
{
  "verdict": "PASS",
  "missingRequirements": [],
  "contradictions": [],
  "dependencyErrors": [],
  "duplicates": [],
  "suggestions": []
}

Example with issues:
{
  "verdict": "FAIL",
  "missingRequirements": ["[Section: Auth] User password reset flow not covered by any task"],
  "contradictions": ["[US-003] Task says REST API but PRD specifies GraphQL"],
  "dependencyErrors": ["[US-005] Depends on US-999 which does not exist"],
  "duplicates": ["[US-002, US-007] Both tasks implement user login"],
  "suggestions": ["[US-003] Change API type from REST to GraphQL to match PRD"]
}

CRITICAL: Each array item MUST be a plain string. Do NOT use nested objects.

## VERDICT RULES
- "PASS" = All PRD requirements covered, dependencies valid, no contradictions
- "FAIL" = Any of: missing requirements, contradictions, invalid dependencies, duplicates

## REVIEW CHECKLIST
1. List all requirements from the PRD
2. For each requirement, find the task(s) that implement it
3. For each task, verify its dependencies exist
4. Check for tasks that do the same thing
5. Verify task descriptions match PRD intent

## IMPORTANT
- Always reference task IDs (e.g., US-001, US-002) when discussing specific tasks
- Be specific about which PRD section is missing or contradicted
- Provide actionable suggestions for fixing issues
- Keep suggestions concise but specific

RESPOND WITH ONLY THE JSON. NO OTHER TEXT.

===== PRD DOCUMENT =====
${prdText}

===== TASKS JSON =====
${tasksJson}`;
}

/**
 * Extract JSON from potentially mixed text output
 */
function extractJson(text: string): ReviewFeedback | null {
  // Try direct parse first
  try {
    return JSON.parse(text.trim()) as ReviewFeedback;
  } catch {
    // Continue to other methods
  }

  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]) as ReviewFeedback;
    } catch {
      // Continue
    }
  }

  // Find JSON objects with "verdict" key
  const verdictMatch = text.match(/\{[^{}]*"verdict"[^{}]*\}/);
  if (verdictMatch) {
    try {
      return JSON.parse(verdictMatch[0]) as ReviewFeedback;
    } catch {
      // Continue
    }
  }

  // Try to find any JSON object by matching braces
  let start = text.indexOf('{');
  while (start !== -1) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(text.substring(start, i + 1)) as ReviewFeedback;
            if ('verdict' in obj) {
              return obj;
            }
          } catch {
            // Continue searching
          }
          break;
        }
      }
    }
    start = text.indexOf('{', start + 1);
  }

  // Last resort: check for explicit FAIL
  if (text.toUpperCase().includes('FAIL')) {
    return {
      verdict: 'FAIL',
      issues: ['Review indicated failure but JSON not parseable'],
    };
  }

  return null;
}

/**
 * Build a standardized log entry for peer review
 */
function buildLogEntry(
  cli: CliType,
  attempt: number,
  timestamp: string,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  parsedFeedback: ReviewFeedback | null
): string {
  return `=== PEER REVIEW LOG ===
CLI: ${cli}
Attempt: ${attempt}
Timestamp: ${timestamp}
Exit Code: ${exitCode}

=== STDOUT ===
${stdout}

=== STDERR ===
${stderr}

=== PARSED FEEDBACK ===
${parsedFeedback ? JSON.stringify(parsedFeedback, null, 2) : 'null'}
`;
}

/**
 * Run peer review using Codex CLI
 * Internal function that handles the Codex-specific execution
 */
async function runWithCodex(
  prompt: string,
  rawOutputPath: string,
  projectPath: string
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let processExited = false;

    const codex = spawn('codex', ['exec', '--output-last-message', rawOutputPath, '-'], {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!processExited) {
        timedOut = true;
        codex.kill('SIGTERM');
        // Force kill after 5 seconds if SIGTERM didn't work
        setTimeout(() => {
          if (!processExited) {
            codex.kill('SIGKILL');
          }
        }, 5000);
      }
    }, CODEX_TIMEOUT_MS);

    codex.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    codex.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Send prompt to stdin
    codex.stdin.write(prompt);
    codex.stdin.end();

    codex.on('close', (code) => {
      processExited = true;
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`Codex CLI timed out after ${CODEX_TIMEOUT_MS / 1000} seconds. Stderr: ${stderr}`));
        return;
      }

      resolve({ stdout, stderr, exitCode: code });
    });

    codex.on('error', (err) => {
      processExited = true;
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn Codex CLI: ${err.message}. Stderr: ${stderr}`));
    });
  });
}

/**
 * Run peer review using the selected CLI (Codex or Claude)
 * Loads global settings to determine which CLI to use.
 */
export async function runPeerReview(options: PeerReviewOptions): Promise<PeerReviewResult> {
  const { prdFile, tasks, project, attempt = 1 } = options;

  // Load global settings to get selected CLI
  const settings = await loadGlobalSettings();
  const selectedCli: CliType = settings.reviewer.cli;

  // Check if selected CLI is available
  const detectionResult = await detectCli(selectedCli);
  if (!detectionResult.available) {
    const feedback: ReviewFeedback = {
      verdict: 'UNKNOWN',
      issues: [`${selectedCli} CLI not available. Please install ${selectedCli} or change the reviewer CLI in Settings.`],
      suggestions: [{ action: `Install ${selectedCli} CLI or change reviewer setting to use an available CLI.` }],
    };

    // Save feedback
    await fs.writeFile(
      project.decomposeFeedbackPath,
      JSON.stringify(feedback, null, 2)
    );

    return {
      success: false,
      feedback,
      logPath: '',
      error: `${selectedCli} CLI not available`,
      cli: selectedCli,
    };
  }

  // Read PRD content
  const prdText = await fs.readFile(prdFile, 'utf-8');
  const tasksJson = JSON.stringify(tasks, null, 2);

  // Build prompt
  const prompt = buildReviewPrompt(prdText, tasksJson);

  // Create log file paths with standardized naming
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join(project.logsDir, `peer_review_attempt_${attempt}_${timestamp}.log`);
  const rawOutputPath = join(project.logsDir, `peer_review_attempt_${attempt}_${timestamp}.raw`);

  // Ensure logs directory exists
  await fs.mkdir(project.logsDir, { recursive: true });

  console.log(`  Running ${selectedCli} peer review (attempt ${attempt})...`);
  console.log(`  Prompt size: ${prompt.length} chars, PRD: ${prdText.length} chars, Tasks: ${tasksJson.length} chars`);

  // Execute based on selected CLI
  if (selectedCli === 'claude') {
    return runPeerReviewWithClaude(prompt, logPath, rawOutputPath, project, attempt, timestamp);
  } else {
    return runPeerReviewWithCodex(prompt, logPath, rawOutputPath, project, attempt, timestamp);
  }
}

/**
 * Run peer review using Claude CLI
 */
async function runPeerReviewWithClaude(
  prompt: string,
  logPath: string,
  rawOutputPath: string,
  project: Project,
  attempt: number,
  timestamp: string
): Promise<PeerReviewResult> {
  try {
    // Save prompt to file for debugging
    const promptPath = rawOutputPath.replace('.raw', '.prompt.txt');
    await fs.writeFile(promptPath, prompt);
    console.log(`  Saved prompt to: ${promptPath}`);

    const startTime = Date.now();
    const result = await runWithClaude({ prompt, outputPath: rawOutputPath, projectPath: project.projectPath });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Claude completed in ${elapsed}s`);

    // Build standardized log with captured output
    const fullLog = buildLogEntry(
      'claude',
      attempt,
      timestamp,
      0, // exit code 0 on success
      result.stdout || '',
      result.stderr || '',
      convertToLegacyFeedback(result.feedback)
    );
    await fs.writeFile(logPath, fullLog);

    // Convert TypedReviewFeedback to local ReviewFeedback
    const feedback: ReviewFeedback = convertToLegacyFeedback(result.feedback);
    feedback.reviewLog = logPath;

    // Save feedback
    await fs.writeFile(
      project.decomposeFeedbackPath,
      JSON.stringify(feedback, null, 2)
    );

    console.log(`  Peer review complete: ${feedback.verdict}`);
    console.log(`  Review log: ${logPath}`);

    return {
      success: true,
      feedback,
      logPath,
      cli: 'claude',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Extract stderr from error message if present
    const stderrMatch = errorMessage.match(/Stderr: (.*)$/);
    const stderr = stderrMatch ? stderrMatch[1] : '';

    // Determine if timeout
    const isTimeout = errorMessage.includes('timed out');

    const feedback: ReviewFeedback = {
      verdict: 'UNKNOWN',
      issues: [isTimeout
        ? `Claude CLI timed out after ${CLAUDE_TIMEOUT_MS / 1000} seconds`
        : `Claude CLI error: ${errorMessage}`
      ],
      reviewLog: logPath,
    };

    // Build log with captured stderr
    const fullLog = buildLogEntry(
      'claude',
      attempt,
      timestamp,
      isTimeout ? null : 1,
      '',
      stderr,
      feedback
    );
    await fs.writeFile(logPath, fullLog);

    await fs.writeFile(
      project.decomposeFeedbackPath,
      JSON.stringify(feedback, null, 2)
    );

    return {
      success: false,
      feedback,
      logPath,
      error: errorMessage,
      cli: 'claude',
    };
  }
}

/**
 * Run peer review using Codex CLI
 */
async function runPeerReviewWithCodex(
  prompt: string,
  logPath: string,
  rawOutputPath: string,
  project: Project,
  attempt: number,
  timestamp: string
): Promise<PeerReviewResult> {
  try {
    const { stdout, stderr, exitCode } = await runWithCodex(prompt, rawOutputPath, project.projectPath);

    // Read the raw output file
    let rawOutput = '';
    try {
      rawOutput = await fs.readFile(rawOutputPath, 'utf-8');
    } catch {
      rawOutput = stdout; // Fall back to stdout if raw file not created
    }

    // Extract JSON from output
    let feedback = extractJson(rawOutput);

    if (!feedback) {
      feedback = {
        verdict: 'UNKNOWN',
        issues: ['Reviewer output could not be parsed as JSON'],
      };
    }

    // Ensure verdict exists
    if (!feedback.verdict) {
      feedback.verdict = 'UNKNOWN';
    }

    // Add log path to feedback
    feedback.reviewLog = logPath;

    // Build standardized log
    const fullLog = buildLogEntry(
      'codex',
      attempt,
      timestamp,
      exitCode,
      stdout,
      stderr,
      feedback
    );
    await fs.writeFile(logPath, fullLog);

    // Save feedback
    await fs.writeFile(
      project.decomposeFeedbackPath,
      JSON.stringify(feedback, null, 2)
    );

    console.log(`  Peer review complete: ${feedback.verdict}`);
    console.log(`  Review log: ${logPath}`);

    return {
      success: exitCode === 0,
      feedback,
      logPath,
      cli: 'codex',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Extract stderr from error message if present
    const stderrMatch = errorMessage.match(/Stderr: (.*)$/);
    const stderr = stderrMatch ? stderrMatch[1] : '';

    // Determine if timeout
    const isTimeout = errorMessage.includes('timed out');

    const feedback: ReviewFeedback = {
      verdict: 'UNKNOWN',
      issues: [isTimeout
        ? `Codex CLI timed out after ${CODEX_TIMEOUT_MS / 1000} seconds`
        : `Codex execution error: ${errorMessage}`
      ],
      reviewLog: logPath,
    };

    // Build log with captured stderr
    const fullLog = buildLogEntry(
      'codex',
      attempt,
      timestamp,
      isTimeout ? null : 1,
      '',
      stderr,
      feedback
    );
    await fs.writeFile(logPath, fullLog);

    await fs.writeFile(
      project.decomposeFeedbackPath,
      JSON.stringify(feedback, null, 2)
    );

    return {
      success: false,
      feedback,
      logPath,
      error: errorMessage,
      cli: 'codex',
    };
  }
}

/**
 * Convert TypedReviewFeedback to local ReviewFeedback format
 */
function convertToLegacyFeedback(typed: TypedReviewFeedback): ReviewFeedback {
  return {
    verdict: typed.verdict,
    missingRequirements: typed.missingRequirements.map(r => ({ requirement: r })),
    contradictions: typed.contradictions.map(c => ({ issue: c })),
    dependencyErrors: typed.dependencyErrors.map(d => ({ issue: d })),
    duplicates: typed.duplicates.map(d => ({ reason: d })),
    suggestions: typed.suggestions.map(s => ({ action: s })),
  };
}
