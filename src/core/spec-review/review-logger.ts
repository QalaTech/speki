/**
 * Review logging functionality for spec review results.
 * Creates human-readable logs, prompt input/output files, and JSON summaries.
 */

import * as fs from 'fs/promises';
import { join } from 'path';
import type { FocusedPromptResult, SpecReviewResult, SuggestionCard } from '../../types/index.js';

/**
 * Input for creating review logs.
 */
export interface ReviewLogInput {
  specPath: string;
  promptResults: FocusedPromptResult[];
  aggregatedResult: SpecReviewResult;
  prompts?: Array<{ name: string; fullPrompt: string }>;
}

/**
 * Output paths from saveReviewLog.
 */
export interface ReviewLogPaths {
  logFile: string;
  promptsDir: string;
  jsonFile: string;
}

/**
 * Saves review results to log files.
 * Creates three outputs:
 * - .ralph/logs/spec_review_<timestamp>.log - human-readable log
 * - .ralph/logs/spec_review_<timestamp>.prompts/ - directory with prompt input/output
 * - .ralph/logs/spec_review_<timestamp>.json - JSON summary
 *
 * @param logDir - Directory to save logs (e.g., .ralph/logs)
 * @param input - Review results and metadata
 * @returns Paths to created log files
 */
export async function saveReviewLog(
  logDir: string,
  input: ReviewLogInput
): Promise<ReviewLogPaths> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFileName = `spec_review_${timestamp}`;

  const logFile = join(logDir, `${baseFileName}.log`);
  const promptsDir = join(logDir, `${baseFileName}.prompts`);
  const jsonFile = join(logDir, `${baseFileName}.json`);

  await fs.mkdir(logDir, { recursive: true });
  await fs.mkdir(promptsDir, { recursive: true });

  await fs.writeFile(logFile, formatHumanReadableLog(input));

  await savePromptFiles(promptsDir, input.promptResults, input.prompts);

  await fs.writeFile(jsonFile, formatJsonSummary(input));

  return { logFile, promptsDir, jsonFile };
}

function formatHumanReadableLog(input: ReviewLogInput): string {
  const { specPath, promptResults, aggregatedResult } = input;
  const lines: string[] = [];

  lines.push('='.repeat(80));
  lines.push('SPEC REVIEW LOG');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(`Spec File: ${specPath}`);
  lines.push(`Review Time: ${new Date().toISOString()}`);
  lines.push(`Overall Verdict: ${aggregatedResult.verdict}`);
  lines.push(`Total Duration: ${aggregatedResult.durationMs}ms`);
  lines.push('');

  lines.push('-'.repeat(80));
  lines.push('PROMPT RESULTS');
  lines.push('-'.repeat(80));
  lines.push('');

  for (const result of promptResults) {
    lines.push(`[${result.promptName}]`);
    lines.push(`  Category: ${result.category}`);
    lines.push(`  Verdict: ${result.verdict}`);
    lines.push(`  Duration: ${result.durationMs}ms`);

    if (result.issues.length > 0) {
      lines.push(`  Issues:`);
      for (const issue of result.issues) {
        lines.push(`    - ${issue}`);
      }
    }

    if (result.suggestions.length > 0) {
      lines.push(`  Suggestions: ${result.suggestions.length}`);
    }

    lines.push('');
  }

  if (aggregatedResult.suggestions.length > 0) {
    lines.push('-'.repeat(80));
    lines.push('ALL SUGGESTIONS');
    lines.push('-'.repeat(80));
    lines.push('');

    for (const suggestion of aggregatedResult.suggestions) {
      lines.push(formatSuggestion(suggestion));
      lines.push('');
    }
  }

  if (aggregatedResult.splitProposal) {
    lines.push('-'.repeat(80));
    lines.push('SPLIT PROPOSAL');
    lines.push('-'.repeat(80));
    lines.push('');
    lines.push(`Reason: ${aggregatedResult.splitProposal.reason}`);
    lines.push(`Proposed Specs:`);
    for (const spec of aggregatedResult.splitProposal.proposedSpecs) {
      lines.push(`  - ${spec.filename}: ${spec.description}`);
      lines.push(`    Estimated Stories: ${spec.estimatedStories}`);
      lines.push(`    Sections: ${spec.sections.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('END OF LOG');
  lines.push('='.repeat(80));

  return lines.join('\n');
}

function formatSuggestion(suggestion: SuggestionCard): string {
  const header = `[${suggestion.severity.toUpperCase()}] ${suggestion.issue}`;
  if (suggestion.suggestedFix) {
    return `${header}\n  Fix: ${suggestion.suggestedFix}`;
  }
  return header;
}

async function savePromptFiles(
  promptsDir: string,
  promptResults: FocusedPromptResult[],
  prompts?: Array<{ name: string; fullPrompt: string }>
): Promise<void> {
  for (let i = 0; i < promptResults.length; i++) {
    const result = promptResults[i];
    const promptInput = prompts?.[i]?.fullPrompt;
    const promptFile = join(promptsDir, `${i + 1}_${result.promptName}.txt`);

    const content: string[] = [];
    content.push('='.repeat(60));
    content.push(`PROMPT: ${result.promptName}`);
    content.push(`CATEGORY: ${result.category}`);
    content.push('='.repeat(60));
    content.push('');

    if (promptInput) {
      content.push('--- INPUT ---');
      content.push(promptInput);
      content.push('');
    }

    content.push('--- OUTPUT ---');
    content.push(`Verdict: ${result.verdict}`);
    content.push(`Duration: ${result.durationMs}ms`);
    content.push('');

    if (result.issues.length > 0) {
      content.push('Issues:');
      for (const issue of result.issues) {
        content.push(`  - ${issue}`);
      }
      content.push('');
    }

    if (result.suggestions.length > 0) {
      content.push(`Suggestions: ${result.suggestions.length}`);
      for (const s of result.suggestions) {
        content.push(`  [${s.severity}] ${s.issue}`);
      }
      content.push('');
    }

    if (result.rawResponse) {
      content.push('--- RAW RESPONSE ---');
      content.push(result.rawResponse);
    }

    await fs.writeFile(promptFile, content.join('\n'));
  }
}

function formatJsonSummary(input: ReviewLogInput): string {
  const { specPath, promptResults, aggregatedResult } = input;

  return JSON.stringify({
    specPath,
    timestamp: new Date().toISOString(),
    verdict: aggregatedResult.verdict,
    durationMs: aggregatedResult.durationMs,
    promptResults: promptResults.map(r => ({
      promptName: r.promptName,
      category: r.category,
      verdict: r.verdict,
      durationMs: r.durationMs,
      issueCount: r.issues.length,
      suggestionCount: r.suggestions.length,
    })),
    suggestions: aggregatedResult.suggestions.map(s => ({
      severity: s.severity,
      issue: s.issue,
      suggestedFix: s.suggestedFix,
    })),
    splitProposal: aggregatedResult.splitProposal ?? null,
    categories: aggregatedResult.categories,
  }, null, 2);
}
