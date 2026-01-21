/**
 * Decomposition Peer Review (Agent-Agnostic)
 *
 * Uses the engine abstraction to compare source PRD with decomposed tasks JSON.
 * Returns PASS/FAIL verdict without modifying the tasks.
 *
 * All agent-specific logic has been moved to drivers (claude-cli.ts, codex-cli.ts).
 * This module only uses generic types and delegates to engine.runReview().
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import type { PRDData, ReviewFeedback } from '../../types/index.js';
import { selectEngine } from '../llm/engine-factory.js';
import type { Project } from '../project.js';
import * as logger from '../logger.js';

export interface PeerReviewOptions {
  /** Path to the PRD markdown file */
  prdFile: string;
  /** Generated tasks PRD data */
  tasks: PRDData;
  /** Project instance for paths */
  project: Project;
  /** Review attempt number (for log naming) */
  attempt?: number;
  /** Preferred engine name (overrides settings) */
  engineName?: string;
  /** Preferred model (overrides settings) */
  model?: string;
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
  /** Which engine was used for the review */
  engineName?: string;
}

/**
 * Build the review prompt (agent-agnostic)
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
Reply with ONLY valid JSON in this EXACT structure:
{
  "verdict": "PASS",
  "missingRequirements": [],
  "contradictions": [],
  "dependencyErrors": [],
  "duplicates": [],
  "suggestions": [],
  "taskGroupings": [],
  "standaloneTasks": []
}

Example with issues and grouping suggestions:
{
  "verdict": "FAIL",
  "missingRequirements": ["[Section: Auth] User password reset flow not covered by any task"],
  "contradictions": ["[US-003] Task says REST API but PRD specifies GraphQL"],
  "dependencyErrors": ["[US-005] Depends on US-999 which does not exist"],
  "duplicates": ["[US-002, US-007] Both tasks implement user login"],
  "suggestions": ["[US-003] Change API type from REST to GraphQL to match PRD"],
  "taskGroupings": [
    {
      "taskIds": ["US-001", "US-002", "US-003"],
      "reason": "Simple type definitions with no implementation logic",
      "complexity": "low"
    },
    {
      "taskIds": ["US-010", "US-011"],
      "reason": "Related utility functions with straightforward logic",
      "complexity": "low"
    }
  ],
  "standaloneTasks": [
    {
      "taskId": "US-015",
      "reason": "Complex integration with external API and multiple error handling paths"
    },
    {
      "taskId": "US-020",
      "reason": "Database schema changes with migration logic - high risk if combined"
    }
  ]
}

CRITICAL:
- missingRequirements, contradictions, dependencyErrors, duplicates, suggestions: arrays of STRINGS
- taskGroupings: array of objects with taskIds (string[]), reason (string), complexity ("low" | "medium")
- standaloneTasks: array of objects with taskId (string), reason (string)

## VERDICT RULES
- "PASS" = All PRD requirements covered, dependencies valid, no contradictions
- "FAIL" = Any of: missing requirements, contradictions, invalid dependencies, duplicates

## REVIEW CHECKLIST
1. List all requirements from the PRD
2. For each requirement, find the task(s) that implement it
3. For each task, verify its dependencies exist
4. Check for tasks that do the same thing
5. Verify task descriptions match PRD intent

## TASK GROUPING ANALYSIS
Each task has a \`complexity\` field set by the decomposition agent (low/medium/high).
Your job is to suggest which LOW complexity tasks can be grouped together for efficiency.

**Grouping Rules:**
- ONLY group tasks with \`complexity: "low"\`
- Grouped tasks must have NO dependencies on each other unless the change is small enough to implement in one go.
- Grouped tasks should be RELATED (same feature area, similar patterns)
- Grouped tasks must have their User acceptance criteria and tests covered. no removing them unless they are a duplicate.
- Maximum 3-4 tasks per group
- Tasks with \`complexity: "medium"\` or \`complexity: "high"\` must ALWAYS be standalone

**Good groupings (related low-complexity tasks):**
- Type definitions for the same domain (User, UserDto, UserRequest)
- Multiple simple interfaces in the same bounded context
- Configuration constants that belong together
- Simple value objects for the same aggregate

**Bad groupings (unrelated or risky):**
- Tasks from different feature areas
- Tasks where one might affect the other
- Tasks with any implementation logic (even if marked low)

## IMPORTANT
- Always reference task IDs (e.g., US-001, US-002) when discussing specific tasks
- Be specific about which PRD section is missing or contradicted
- Provide actionable suggestions for fixing issues
- Keep suggestions concise but specific
- Grouping suggestions help reduce iterations without sacrificing quality

RESPOND WITH ONLY THE JSON. NO OTHER TEXT.

===== PRD DOCUMENT =====
${prdText}

===== TASKS JSON =====
${tasksJson}`;
}

/**
 * Build a standardized log entry for peer review
 */
function buildLogEntry(
  engineName: string,
  attempt: number,
  timestamp: string,
  feedback: ReviewFeedback,
  rawOutput: string,
  error?: string
): string {
  return `=== PEER REVIEW LOG ===
Engine: ${engineName}
Attempt: ${attempt}
Timestamp: ${timestamp}

=== FEEDBACK ===
${JSON.stringify(feedback, null, 2)}

=== ERROR ===
${error || 'none'}

=== RAW OUTPUT ===
${rawOutput}
`;
}

/**
 * Run peer review using the selected engine
 * This is now completely agent-agnostic - all specifics are in the drivers
 */
export async function runPeerReview(
  options: PeerReviewOptions
): Promise<PeerReviewResult> {
  const { prdFile, tasks, project, attempt = 1, engineName, model } = options;

  logger.debug(`runPeerReview called (attempt ${attempt})`, 'peer-review');

  try {
    // Select engine based on options/settings/env with decompose purpose
    const selection = await selectEngine({ engineName, model, purpose: 'decompose' });
    const engine = selection.engine;
    const selectedEngineName = selection.engineName;
    const selectedModel = selection.model;

    logger.debug(`Selected engine: ${selectedEngineName}${selectedModel ? `, model: ${selectedModel}` : ''}`, 'peer-review');

    // Check if engine is available
    const availability = await engine.isAvailable();
    if (!availability.available) {
      const feedback: ReviewFeedback = {
        verdict: 'FAIL',
        missingRequirements: [],
        contradictions: [],
        dependencyErrors: [],
        duplicates: [],
        suggestions: [`${selectedEngineName} not available. Please install ${selectedEngineName} or select a different engine.`],
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
        error: `${selectedEngineName} not available`,
        engineName: selectedEngineName,
      };
    }

    // Read PRD content
    const prdText = await fs.readFile(prdFile, 'utf-8');
    const tasksJson = JSON.stringify(tasks, null, 2);

    // Build prompt (generic, works for all engines)
    const prompt = buildReviewPrompt(prdText, tasksJson);

    // Create log file paths with standardized naming
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(
      project.logsDir,
      `peer_review_attempt_${attempt}_${timestamp}.log`
    );
    const rawOutputPath = join(
      project.logsDir,
      `peer_review_attempt_${attempt}_${timestamp}.raw`
    );

    // Ensure logs directory exists
    await fs.mkdir(project.logsDir, { recursive: true });

    console.log(`  Running ${selectedEngineName} peer review (attempt ${attempt})...`);
    console.log(
      `  Prompt size: ${prompt.length} chars, PRD: ${prdText.length} chars, Tasks: ${tasksJson.length} chars`
    );

    // Run review using engine (agent-agnostic call)
    const result = await engine.runReview({
      prompt,
      outputPath: rawOutputPath,
      projectPath: project.projectPath,
      model: selectedModel,
    });

    // Build log entry
    const fullLog = buildLogEntry(
      selectedEngineName,
      attempt,
      timestamp,
      result.feedback,
      result.stdout || '',
      result.error
    );
    await fs.writeFile(logPath, fullLog);

    // Save feedback
    await fs.writeFile(
      project.decomposeFeedbackPath,
      JSON.stringify(result.feedback, null, 2)
    );

    console.log(`  Peer review complete: ${result.feedback.verdict}`);
    console.log(`  Review log: ${logPath}`);

    return {
      success: result.success,
      feedback: result.feedback,
      logPath,
      error: result.error,
      engineName: selectedEngineName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`runPeerReview error: ${errorMessage}`, 'peer-review');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(
      project.logsDir,
      `peer_review_attempt_${attempt}_${timestamp}.log`
    );

    const feedback: ReviewFeedback = {
      verdict: 'FAIL',
      missingRequirements: [],
      contradictions: [],
      dependencyErrors: [],
      duplicates: [],
      suggestions: [],
    };

    // Write error log
    const errorLog = buildLogEntry(
      options.engineName || 'unknown',
      attempt,
      timestamp,
      feedback,
      '',
      errorMessage
    );
    await fs.writeFile(logPath, errorLog);

    // Save feedback
    await fs.writeFile(
      project.decomposeFeedbackPath,
      JSON.stringify(feedback, null, 2)
    );

    return {
      success: false,
      feedback,
      logPath,
      error: errorMessage,
      engineName: options.engineName,
    };
  }
}
