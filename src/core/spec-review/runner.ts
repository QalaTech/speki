import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import { resolveCliPath } from '../cli-path.js';
import { selectEngine } from '../llm/engine-factory.js';
import { gatherCodebaseContext } from './codebase-context.js';
import { aggregateResults } from './aggregator.js';
import { getReviewTimeout } from './timeout.js';
import { saveReviewLog } from './review-logger.js';
import {
  MISSING_REQUIREMENTS_PROMPT,
  CONTRADICTIONS_PROMPT,
  DEPENDENCY_VALIDATION_PROMPT,
  DUPLICATE_DETECTION_PROMPT,
  getReviewPromptsForType,
  TECH_SPEC_STORY_ALIGNMENT_PROMPT,
  buildAggregationPrompt,
} from './prompts.js';
import type { FocusedPromptResult, SpecReviewResult, CodebaseContext, SuggestionCard, SuggestionType, SpecReviewVerdict, ReviewFeedback, CliType, TimeoutInfo, SpecType, UserStory } from '../../types/index.js';
import { detectSpecType, getParentSpec, loadPRDForSpec, extractSpecId } from './spec-metadata.js';

export interface SpecReviewOptions {
  /** Timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Path to golden standard file (defaults to .ralph/standards/golden_standard_prd_deterministic_decomposable.md) */
  goldenStandardPath?: string;
  /** Directory for log files */
  logDir?: string;
  /** CLI to use for review (claude or codex) */
  cli?: CliType;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Spec type (auto-detected from file if not provided) */
  specType?: SpecType;
}

// Re-export TimeoutInfo for convenience
export type { TimeoutInfo } from '../../types/index.js';

interface PromptDefinition {
  name: string;
  category: string;
  template: string;
}

const DECOMPOSE_PROMPTS: PromptDefinition[] = [
  { name: 'missing_requirements', category: 'coverage', template: MISSING_REQUIREMENTS_PROMPT },
  { name: 'contradictions', category: 'consistency', template: CONTRADICTIONS_PROMPT },
  { name: 'dependency_validation', category: 'dependencies', template: DEPENDENCY_VALIDATION_PROMPT },
  { name: 'duplicate_detection', category: 'duplicates', template: DUPLICATE_DETECTION_PROMPT },
];

async function loadGoldenStandard(cwd: string, customPath?: string): Promise<string> {
  const standardPath = customPath ?? join(cwd, '.ralph', 'standards', 'golden_standard_prd_deterministic_decomposable.md');

  try {
    return await fs.readFile(standardPath, 'utf-8');
  } catch {
    return '';
  }
}

function buildPrompt(
  template: string,
  specPath: string,
  codebaseContext: CodebaseContext,
  goldenStandard: string
): string {
  const contextString = JSON.stringify(codebaseContext, null, 2);

  let prompt = template
    .replace('{specPath}', specPath)
    .replace('{codebaseContext}', contextString);

  if (goldenStandard) {
    prompt = `## GOLDEN STANDARD REFERENCE\n${goldenStandard}\n\n${prompt}`;
  }

  return prompt;
}

function buildDecomposePrompt(template: string, specContent: string, tasksJson: string): string {
  return template
    .replace('{specContent}', specContent)
    .replace('{tasksJson}', tasksJson);
}

/**
 * Builds the story alignment prompt for tech specs with parent user stories
 */
function buildStoryAlignmentPrompt(
  template: string,
  techSpecContent: string,
  parentUserStories: UserStory[],
  codebaseContext: CodebaseContext
): string {
  const storiesJson = JSON.stringify(parentUserStories.map(s => ({
    id: s.id,
    title: s.title,
    description: s.description,
    acceptanceCriteria: s.acceptanceCriteria,
    priority: s.priority,
  })), null, 2);

  const contextString = JSON.stringify(codebaseContext, null, 2);

  return template
    .replace('{parentUserStories}', storiesJson)
    .replace('{techSpecContent}', techSpecContent)
    .replace('{codebaseContext}', contextString);
}

/**
 * Loads parent user stories for a tech spec
 */
async function loadParentUserStories(
  projectRoot: string,
  specPath: string
): Promise<UserStory[] | null> {
  try {
    const specId = extractSpecId(basename(specPath));
    const parentMetadata = await getParentSpec(projectRoot, specId);

    if (!parentMetadata?.specPath) {
      return null;
    }

    // Extract parent spec ID from the spec path
    const parentSpecId = extractSpecId(basename(parentMetadata.specPath));
    const parentPrd = await loadPRDForSpec(projectRoot, parentSpecId);
    return parentPrd?.userStories ?? null;
  } catch {
    return null;
  }
}

function createErrorResult(
  promptDef: PromptDefinition,
  errorMessage: string,
  rawResponse: string,
  durationMs: number
): FocusedPromptResult {
  return {
    promptName: promptDef.name,
    category: promptDef.category,
    verdict: 'FAIL' as SpecReviewVerdict,
    issues: [errorMessage],
    suggestions: [],
    rawResponse,
    durationMs,
  };
}

interface RunPromptOptions {
  disableTools?: boolean;
  cli?: CliType;
}

const SIGKILL_DELAY_MS = 5000;

async function runPrompt(
  promptDef: PromptDefinition,
  fullPrompt: string,
  cwd: string,
  timeoutMs: number,
  options: RunPromptOptions = {}
): Promise<FocusedPromptResult> {
  const startTime = Date.now();
  try {
    // Ensure a logs directory exists
    const logsDir = join(cwd, '.ralph', 'logs');
    try { await fs.mkdir(logsDir, { recursive: true }); } catch {}
    const promptPath = join(logsDir, `spec_review_${promptDef.name}_${Date.now()}.md`);
    await fs.writeFile(promptPath, fullPrompt, 'utf-8');

    const sel = await selectEngine();
    const result = await sel.engine.runStream({
      promptPath,
      cwd,
      logDir: logsDir,
      iteration: 0,
      model: sel.model,
    });

    const durationMs = Date.now() - startTime;
    return parsePromptResponse(promptDef, result.output, durationMs);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    return createErrorResult(promptDef, (err as Error).message || 'Engine error', '', durationMs);
  }
}

function createParseFailureResult(
  promptDef: PromptDefinition,
  errorMessage: string,
  rawResponse: string,
  durationMs: number
): FocusedPromptResult {
  return {
    promptName: promptDef.name,
    category: promptDef.category,
    verdict: 'NEEDS_IMPROVEMENT' as SpecReviewVerdict,
    issues: [errorMessage],
    suggestions: [],
    rawResponse,
    durationMs,
  };
}

function parsePromptResponse(
  promptDef: PromptDefinition,
  response: string,
  durationMs: number
): FocusedPromptResult {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);

  if (!jsonMatch) {
    return createParseFailureResult(promptDef, 'Could not parse structured response', response, durationMs);
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);

    return {
      promptName: promptDef.name,
      category: promptDef.category,
      verdict: (parsed.verdict ?? 'PASS') as SpecReviewVerdict,
      issues: parsed.issues ?? [],
      suggestions: parseSuggestions(parsed.suggestions ?? [], promptDef.category),
      rawResponse: response,
      durationMs,
    };
  } catch {
    return createParseFailureResult(promptDef, 'Failed to parse JSON response', response, durationMs);
  }
}

function parseSuggestions(rawSuggestions: unknown[], category: string): SuggestionCard[] {
  if (!Array.isArray(rawSuggestions)) return [];

  return rawSuggestions.map((s, index) => {
    const defaultId = `${category}-${index}`;

    if (typeof s === 'string') {
      return {
        id: defaultId,
        category,
        severity: 'info' as const,
        type: 'comment' as const,
        section: '',
        textSnippet: '',
        issue: s,
        suggestedFix: '',
        status: 'pending' as const,
      };
    }

    const raw = s as Record<string, unknown>;
    // Determine type: use AI-provided value, fallback to heuristic
    const textSnippet = (raw.textSnippet as string) ?? '';
    const suggestedFix = (raw.suggestedFix as string) ?? '';
    const hasConcreteChange = textSnippet.length > 0 && suggestedFix.length > 20 && !suggestedFix.includes('?');
    const inferredType: SuggestionType = hasConcreteChange ? 'change' : 'comment';

    return {
      id: (raw.id as string) ?? defaultId,
      category: (raw.category as string) ?? category,
      severity: (raw.severity as 'critical' | 'warning' | 'info') ?? 'info',
      type: (raw.type as SuggestionType) ?? inferredType,
      section: (raw.section as string) ?? '',
      lineStart: raw.lineStart as number | undefined,
      lineEnd: raw.lineEnd as number | undefined,
      textSnippet,
      issue: (raw.issue as string) ?? '',
      suggestedFix,
      status: 'pending' as const,
    };
  });
}

function isTimeoutResult(result: FocusedPromptResult): boolean {
  return result.issues.some(issue => issue === 'Review timed out');
}

/**
 * Runs the aggregation agent to deduplicate and synthesize review findings
 */
async function runAggregationAgent(
  specPath: string,
  results: FocusedPromptResult[],
  cwd: string,
  timeoutMs: number,
  cli?: CliType,
  onProgress?: (message: string) => void
): Promise<{
  verdict: SpecReviewVerdict;
  executiveSummary: string;
  suggestions: SuggestionCard[];
  totalIssuesBeforeDedup: number;
  totalIssuesAfterDedup: number;
  splitProposal?: { reason: string; proposedSpecs: Array<{ filename: string; description: string }> };
} | null> {
  const progress = onProgress ?? (() => {});
  progress('Running aggregation agent to deduplicate findings...');

  // Prepare review results for the aggregation prompt
  const reviewResultsForPrompt = results.map(r => ({
    promptName: r.promptName,
    verdict: r.verdict,
    issues: r.issues,
    suggestions: r.suggestions,
  }));

  const aggregationPrompt = buildAggregationPrompt(specPath, reviewResultsForPrompt, results.length);

  const aggregationDef = {
    name: 'review_aggregation',
    category: 'aggregation',
    template: '', // Not used, we have the full prompt
  };

  // Run with tools enabled so agent can read the spec
  const aggregationResult = await runPrompt(
    aggregationDef,
    aggregationPrompt,
    cwd,
    timeoutMs,
    { cli, disableTools: false }
  );

  if (isTimeoutResult(aggregationResult)) {
    progress('Aggregation agent timed out, using simple aggregation');
    return null;
  }

  // Parse the aggregation result
  try {
    const jsonMatch = aggregationResult.rawResponse?.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      progress('Could not parse aggregation result, using simple aggregation');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[1]);
    progress(`Aggregation complete: ${parsed.totalIssuesBeforeDedup} issues → ${parsed.totalIssuesAfterDedup} after dedup`);

    // Convert parsed suggestions to SuggestionCard format
    const suggestions: SuggestionCard[] = (parsed.suggestions || []).map((s: Record<string, unknown>, index: number) => ({
      id: (s.id as string) || `agg-${index}`,
      category: (s.category as string) || 'general',
      severity: (s.severity as 'critical' | 'warning' | 'info') || 'info',
      type: (s.type as 'change' | 'comment') || 'comment',
      section: (s.section as string) || '',
      lineStart: s.lineStart as number | undefined,
      lineEnd: s.lineEnd as number | undefined,
      textSnippet: (s.textSnippet as string) || '',
      issue: (s.issue as string) || '',
      suggestedFix: (s.suggestedFix as string) || '',
      status: 'pending' as const,
    }));

    return {
      verdict: (parsed.verdict as SpecReviewVerdict) || 'PASS',
      executiveSummary: (parsed.executiveSummary as string) || '',
      suggestions,
      totalIssuesBeforeDedup: parsed.totalIssuesBeforeDedup || results.flatMap(r => r.suggestions).length,
      totalIssuesAfterDedup: parsed.totalIssuesAfterDedup || suggestions.length,
      splitProposal: parsed.splitProposal || undefined,
    };
  } catch (error) {
    progress(`Aggregation parsing failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return null;
  }
}

export async function runSpecReview(
  specPath: string,
  options: SpecReviewOptions = {}
): Promise<SpecReviewResult> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? getReviewTimeout();
  const logDir = options.logDir ?? join(cwd, '.ralph', 'logs');
  const onProgress = options.onProgress ?? (() => {});

  await fs.mkdir(logDir, { recursive: true });

  const specContent = await fs.readFile(specPath, 'utf-8');
  const specBasename = basename(specPath);
  const goldenStandard = await loadGoldenStandard(cwd, options.goldenStandardPath);
  const codebaseContext = await gatherCodebaseContext(dirname(specPath));

  // Detect spec type (auto-detect if not provided)
  let specType = options.specType;
  if (!specType) {
    const detected = await detectSpecType(specPath, specContent);
    specType = detected.type;
  }

  // Get type-specific prompts
  const reviewPrompts = getReviewPromptsForType(specType);

  // For tech specs, load parent user stories for story alignment prompt
  let parentUserStories: UserStory[] | null = null;
  if (specType === 'tech-spec') {
    parentUserStories = await loadParentUserStories(cwd, specPath);
    if (parentUserStories && parentUserStories.length > 0) {
      onProgress(`Loaded ${parentUserStories.length} parent user stories for alignment check`);
    }
  }

  onProgress(`Loaded spec: ${specBasename} (type: ${specType})`);
  onProgress(`Running ${reviewPrompts.length} review prompts...`);

  const promptTimeoutMs = Math.floor(timeoutMs / reviewPrompts.length);
  const results: FocusedPromptResult[] = [];
  const prompts: Array<{ name: string; fullPrompt: string }> = [];
  const completedPromptNames: string[] = [];
  let didTimeout = false;

  for (const promptDef of reviewPrompts) {
    onProgress(`Running ${promptDef.name}...`);

    let fullPrompt: string;

    // Special handling for story alignment prompt
    if (promptDef.name === 'tech_spec_story_alignment') {
      if (!parentUserStories || parentUserStories.length === 0) {
        // Skip story alignment if no parent stories available
        onProgress(`${promptDef.name}: SKIPPED (no parent user stories)`);
        continue;
      }
      fullPrompt = buildStoryAlignmentPrompt(
        TECH_SPEC_STORY_ALIGNMENT_PROMPT,
        specContent,
        parentUserStories,
        codebaseContext
      );
    } else {
      fullPrompt = buildPrompt(promptDef.template, specPath, codebaseContext, goldenStandard);
    }

    prompts.push({ name: promptDef.name, fullPrompt });
    // Tools must be enabled so AI can read the spec file with line numbers
    const result = await runPrompt(promptDef, fullPrompt, cwd, promptTimeoutMs, { cli: options.cli, disableTools: false });

    if (isTimeoutResult(result)) {
      didTimeout = true;
      onProgress(`${promptDef.name}: TIMEOUT (${result.durationMs}ms)`);
      results.push(result);
      break; // Stop processing - remaining prompts would also likely timeout
    }

    onProgress(`${promptDef.name}: ${result.verdict} (${result.durationMs}ms)`);
    completedPromptNames.push(promptDef.name);
    results.push(result);
  }

  // Run aggregation agent to deduplicate and synthesize findings
  // Give it 2 minutes for aggregation (or remaining time if timeout already occurred)
  const aggregationTimeoutMs = didTimeout ? 30000 : 120000;
  const aggregationAgentResult = await runAggregationAgent(
    specPath,
    results,
    cwd,
    aggregationTimeoutMs,
    options.cli,
    onProgress
  );

  let aggregatedResult: SpecReviewResult;

  if (aggregationAgentResult) {
    // Use the agent's deduplicated results
    aggregatedResult = {
      verdict: aggregationAgentResult.verdict,
      categories: buildCategories(results),
      splitProposal: aggregationAgentResult.splitProposal ? {
        originalFile: specPath,
        reason: aggregationAgentResult.splitProposal.reason,
        proposedSpecs: aggregationAgentResult.splitProposal.proposedSpecs.map(s => ({
          filename: s.filename,
          description: s.description,
          sections: [],
          estimatedStories: 0,
        })),
      } : undefined,
      codebaseContext,
      suggestions: aggregationAgentResult.suggestions,
      logPath: '',
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      executiveSummary: aggregationAgentResult.executiveSummary,
      deduplicationStats: {
        before: aggregationAgentResult.totalIssuesBeforeDedup,
        after: aggregationAgentResult.totalIssuesAfterDedup,
      },
    };
  } else {
    // Fallback to simple aggregation if agent fails
    aggregatedResult = aggregateResults(results, codebaseContext, '', specPath);
  }

  const logPaths = await saveReviewLog(logDir, {
    specPath,
    promptResults: results,
    aggregatedResult,
    prompts,
  });

  const finalResult: SpecReviewResult = { ...aggregatedResult, logPath: logPaths.jsonFile };

  if (didTimeout) {
    finalResult.timeoutInfo = {
      timeoutMs,
      completedPrompts: completedPromptNames.length,
      totalPrompts: reviewPrompts.length,
      completedPromptNames,
    };
  }

  return finalResult;
}

/**
 * Builds categorized results from prompt results (helper for aggregation).
 */
function buildCategories(results: FocusedPromptResult[]): Record<string, { verdict: SpecReviewVerdict; issues: string[] }> {
  const categories: Record<string, { verdict: SpecReviewVerdict; issues: string[] }> = {};

  for (const result of results) {
    const categoryKey = result.category || result.promptName;
    categories[categoryKey] = {
      verdict: result.verdict,
      issues: result.issues,
    };
  }

  return categories;
}

export interface DecomposeReviewOptions {
  /** Timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Directory for log files */
  logDir?: string;
}

function aggregateDecomposeResults(results: FocusedPromptResult[]): ReviewFeedback {
  const missingRequirements: string[] = [];
  const contradictions: string[] = [];
  const dependencyErrors: string[] = [];
  const duplicates: string[] = [];
  const suggestions: string[] = [];

  let hasFailure = false;

  for (const result of results) {
    if (result.verdict === 'FAIL') {
      hasFailure = true;
    }

    const issues = result.issues;
    switch (result.promptName) {
      case 'missing_requirements':
        missingRequirements.push(...issues);
        break;
      case 'contradictions':
        contradictions.push(...issues);
        break;
      case 'dependency_validation':
        dependencyErrors.push(...issues);
        break;
      case 'duplicate_detection':
        duplicates.push(...issues);
        break;
    }

    suggestions.push(...result.suggestions.map((s) => s.issue || s.suggestedFix).filter(Boolean));
  }

  return {
    verdict: hasFailure ? 'FAIL' : 'PASS',
    missingRequirements,
    contradictions,
    dependencyErrors,
    duplicates,
    suggestions,
  };
}

export async function runDecomposeReview(
  specContent: string,
  tasksJson: string,
  options: DecomposeReviewOptions = {}
): Promise<ReviewFeedback> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? getReviewTimeout();
  const logDir = options.logDir ?? join(cwd, '.ralph', 'logs');

  await fs.mkdir(logDir, { recursive: true });

  const promptTimeoutMs = Math.floor(timeoutMs / DECOMPOSE_PROMPTS.length);
  const results: FocusedPromptResult[] = [];

  for (const promptDef of DECOMPOSE_PROMPTS) {
    const fullPrompt = buildDecomposePrompt(promptDef.template, specContent, tasksJson);
    const result = await runPrompt(promptDef, fullPrompt, cwd, promptTimeoutMs, { disableTools: true });
    results.push(result);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join(logDir, `decompose-review-${timestamp}.json`);
  const aggregatedResult = aggregateDecomposeResults(results);

  await fs.writeFile(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    promptResults: results,
    aggregatedResult,
  }, null, 2));

  return aggregatedResult;
}
