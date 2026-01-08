/**
 * Decomposition Peer Review
 *
 * Uses Codex to compare the source PRD with the decomposed tasks JSON.
 * Returns PASS/FAIL verdict without modifying the tasks.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { Project } from '../project.js';
import type { PRDData } from '../../types/index.js';

export interface ReviewFeedback {
  verdict: 'PASS' | 'FAIL' | 'UNKNOWN';
  missingRequirements?: Array<{
    requirement: string;
    prdSection?: string;
  }>;
  contradictions?: Array<{
    taskId: string;
    issue: string;
    prdSection?: string;
  }>;
  dependencyErrors?: Array<{
    taskId: string;
    issue: string;
    dependsOn?: string;
  }>;
  duplicates?: Array<{
    taskIds: string[];
    reason: string;
  }>;
  suggestions?: Array<{
    taskId?: string;
    action: string;
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
Reply with ONLY valid JSON in this exact structure:
{
  "verdict": "PASS" or "FAIL",
  "missingRequirements": [
    {"requirement": "description of missing PRD requirement", "prdSection": "section name from PRD"}
  ],
  "contradictions": [
    {"taskId": "US-XXX", "issue": "description of how task contradicts PRD", "prdSection": "relevant PRD section"}
  ],
  "dependencyErrors": [
    {"taskId": "US-XXX", "issue": "description of dependency problem", "dependsOn": "US-YYY or missing task"}
  ],
  "duplicates": [
    {"taskIds": ["US-XXX", "US-YYY"], "reason": "why these tasks overlap"}
  ],
  "suggestions": [
    {"taskId": "US-XXX or null for new task", "action": "specific actionable fix"}
  ]
}

## VERDICT RULES
- "PASS" = All PRD requirements are covered by tasks, dependencies are valid, no contradictions
- "FAIL" = One or more of:
  - Missing PRD requirements (not covered by any task)
  - Tasks contradict the PRD
  - Invalid dependencies (depend on non-existent tasks)
  - Significant duplicate tasks

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
 * Check if codex CLI is available
 */
async function isCodexAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('codex', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    check.on('close', (code) => {
      resolve(code === 0);
    });

    check.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Run peer review using Codex
 */
export async function runPeerReview(options: PeerReviewOptions): Promise<PeerReviewResult> {
  const { prdFile, tasks, project, attempt = 1 } = options;

  // Check if codex is available
  if (!(await isCodexAvailable())) {
    const feedback: ReviewFeedback = {
      verdict: 'UNKNOWN',
      issues: ['Codex CLI not found. Install codex to enable peer review.'],
      suggestions: [{ action: 'Install Codex CLI to enable decomposition peer review.' }],
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
      error: 'Codex CLI not available',
    };
  }

  // Read PRD content
  const prdText = await fs.readFile(prdFile, 'utf-8');
  const tasksJson = JSON.stringify(tasks, null, 2);

  // Build prompt
  const prompt = buildReviewPrompt(prdText, tasksJson);

  // Create log file path
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join(project.logsDir, `peer_review_attempt_${attempt}_${timestamp}.log`);
  const rawOutputPath = join(project.logsDir, `peer_review_attempt_${attempt}_${timestamp}.raw`);

  // Ensure logs directory exists
  await fs.mkdir(project.logsDir, { recursive: true });

  console.log(`  Running Codex peer review (attempt ${attempt})...`);

  return new Promise((resolve) => {
    // Spawn codex exec with --output-last-message to get just the response
    const codex = spawn('codex', ['exec', '--output-last-message', rawOutputPath, '-'], {
      cwd: project.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    codex.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    codex.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Send prompt to stdin
    codex.stdin.write(prompt);
    codex.stdin.end();

    codex.on('close', async (code) => {
      // Save full output to log
      const fullLog = `=== CODEX PEER REVIEW LOG ===
Attempt: ${attempt}
Timestamp: ${new Date().toISOString()}
Exit Code: ${code}

=== STDOUT ===
${stdout}

=== STDERR ===
${stderr}
`;
      await fs.writeFile(logPath, fullLog);

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

      // Save feedback
      await fs.writeFile(
        project.decomposeFeedbackPath,
        JSON.stringify(feedback, null, 2)
      );

      console.log(`  Peer review complete: ${feedback.verdict}`);
      console.log(`  Review log: ${logPath}`);

      resolve({
        success: code === 0,
        feedback,
        logPath,
      });
    });

    codex.on('error', async (err) => {
      const feedback: ReviewFeedback = {
        verdict: 'UNKNOWN',
        issues: [`Codex execution error: ${err.message}`],
        reviewLog: logPath,
      };

      await fs.writeFile(
        project.decomposeFeedbackPath,
        JSON.stringify(feedback, null, 2)
      );

      resolve({
        success: false,
        feedback,
        logPath,
        error: err.message,
      });
    });
  });
}
