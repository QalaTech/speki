import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';

/**
 * Clean up old prompt files with the same prefix before creating a new one.
 * This prevents accumulation of intermediate prompt files in the logs directory.
 */
async function cleanupOldPromptFiles(logsDir: string, promptName: string): Promise<void> {
  try {
    const files = await fs.readdir(logsDir);
    const prefix = `spec_review_${promptName}_`;
    const oldFiles = files.filter(f => f.startsWith(prefix) && f.endsWith('.md'));

    // Delete all old files with this prefix
    await Promise.all(
      oldFiles.map(f => fs.unlink(join(logsDir, f)).catch(() => {}))
    );
  } catch {
    // Directory might not exist yet, that's fine
  }
}
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
  buildFileOutputInstruction,
} from './prompts.js';
import type { FocusedPromptResult, SpecReviewResult, CodebaseContext, SuggestionCard, SuggestionType, SpecReviewVerdict, ReviewFeedback, CliType, TimeoutInfo, SpecType, UserStory, DecomposeIssue } from '../types/index.js';
import { detectSpecType, getParentSpec, loadPRDForSpec, extractSpecId } from './spec-metadata.js';

export interface SpecReviewOptions {
  /** Timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Path to golden standard file (defaults to .speki/standards/golden_standard_prd_deterministic_decomposable.md) */
  goldenStandardPath?: string;
  /** Directory for log files */
  logDir?: string;
  /** Preferred engine name and model (overrides settings/env) */
  engineName?: string;
  model?: string;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Spec type (auto-detected from file if not provided) */
  specType?: SpecType;
  /** Stream callbacks for real-time log output */
  streamCallbacks?: import('../claude/types.js').StreamCallbacks;
}

// Re-export TimeoutInfo for convenience
export type { TimeoutInfo } from '../types/index.js';

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
  const standardPath = customPath ?? join(cwd, '.speki', 'standards', 'golden_standard_prd_deterministic_decomposable.md');

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
  goldenStandard: string,
  verdictOutputPath?: string,
  promptName?: string,
  category?: string
): string {
  const contextString = JSON.stringify(codebaseContext, null, 2);

  let prompt = template
    .replace('{specPath}', specPath)
    .replace('{codebaseContext}', contextString);

  if (goldenStandard) {
    prompt = `## GOLDEN STANDARD REFERENCE\n${goldenStandard}\n\n${prompt}`;
  }

  // Append file output instruction if output path is provided
  if (verdictOutputPath && promptName && category) {
    prompt += buildFileOutputInstruction(verdictOutputPath, promptName, category);
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
    issues: [{ id: 'error-0', severity: 'critical', description: errorMessage }],
    suggestions: [],
    rawResponse,
    durationMs,
  };
}

interface RunPromptOptions {
  disableTools?: boolean;
  engineName?: string;
  model?: string;
  streamCallbacks?: import('../claude/types.js').StreamCallbacks;
  logDir?: string;
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
    // Use provided logDir or fallback to .speki/logs
    const logsDir = options.logDir ?? join(cwd, '.speki', 'logs');
    try { await fs.mkdir(logsDir, { recursive: true }); } catch {}

    // Clean up old prompt files to prevent accumulation
    await cleanupOldPromptFiles(logsDir, promptDef.name);

    const promptPath = join(logsDir, `spec_review_${promptDef.name}_${Date.now()}.md`);
    await fs.writeFile(promptPath, fullPrompt, 'utf-8');

    const sel = await selectEngine({
      engineName: options.engineName,
      model: options.model,
      purpose: 'specReview',
    });
    const result = await sel.engine.runStream({
      promptPath,
      cwd,
      logDir: logsDir,
      iteration: 0,
      model: sel.model,
      callbacks: options.streamCallbacks,
    });

    const durationMs = Date.now() - startTime;
    return parsePromptResponse(promptDef, result.output, durationMs);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    return createErrorResult(promptDef, (err as Error).message || 'Engine error', '', durationMs);
  }
}

/**
 * Runs a prompt and expects the agent to write its verdict to a file.
 * Does not parse the response stream - the verdict is read from the file separately.
 */
async function runPromptWithFileOutput(
  promptDef: PromptDefinition,
  fullPrompt: string,
  cwd: string,
  timeoutMs: number,
  options: RunPromptOptions = {}
): Promise<void> {
  try {
    const logsDir = options.logDir ?? join(cwd, '.speki', 'logs');
    try { await fs.mkdir(logsDir, { recursive: true }); } catch {}

    // Clean up old prompt files to prevent accumulation
    await cleanupOldPromptFiles(logsDir, promptDef.name);

    const promptPath = join(logsDir, `spec_review_${promptDef.name}_${Date.now()}.md`);
    await fs.writeFile(promptPath, fullPrompt, 'utf-8');

    const sel = await selectEngine({
      engineName: options.engineName,
      model: options.model,
      purpose: 'specReview',
    });

    // Run the agent - it will write its verdict to the specified file
    await sel.engine.runStream({
      promptPath,
      cwd,
      logDir: logsDir,
      iteration: 0,
      model: sel.model,
      callbacks: options.streamCallbacks,
    });
  } catch (err) {
    // Log error but don't throw - verdict file read will handle missing file
    console.error(`Agent execution error for ${promptDef.name}: ${(err as Error).message}`);
  }
}

/**
 * Reads a verdict JSON file written by an agent.
 * Returns a FocusedPromptResult parsed from the file contents.
 */
async function readVerdictFile(
  verdictPath: string,
  promptDef: PromptDefinition,
  durationMs: number
): Promise<FocusedPromptResult> {
  try {
    const content = await fs.readFile(verdictPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Validate required fields
    if (!parsed.verdict) {
      return createParseFailureResult(
        promptDef,
        `Verdict file missing 'verdict' field: ${verdictPath}`,
        content,
        durationMs
      );
    }

    return {
      promptName: promptDef.name,
      category: promptDef.category,
      verdict: parsed.verdict as SpecReviewVerdict,
      issues: parseIssues(parsed.issues ?? []),
      suggestions: parseSuggestions(parsed.suggestions ?? [], promptDef.category),
      rawResponse: content,
      durationMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return createParseFailureResult(
        promptDef,
        `Agent did not write verdict file: ${verdictPath}`,
        '',
        durationMs
      );
    }
    return createParseFailureResult(
      promptDef,
      `Failed to read verdict file: ${errorMsg}`,
      '',
      durationMs
    );
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
    issues: [{ id: 'parse-error-0', severity: 'warning', description: errorMessage }],
    suggestions: [],
    rawResponse,
    durationMs,
  };
}

/**
 * Normalizes raw LLM issue output into DecomposeIssue[].
 * Handles structured objects (use as-is), plain strings (wrap with warning severity),
 * and missing/invalid severity (default to warning).
 */
function parseIssues(rawIssues: unknown[]): DecomposeIssue[] {
  if (!Array.isArray(rawIssues)) return [];

  return rawIssues.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: `auto-${index}`,
        severity: 'warning' as const,
        description: item,
      };
    }

    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const severity = obj.severity;
      const validSeverity = severity === 'critical' || severity === 'warning' || severity === 'info'
        ? severity as 'critical' | 'warning' | 'info'
        : 'warning';

      return {
        id: (obj.id as string) || `auto-${index}`,
        severity: validSeverity,
        description: (obj.description as string) || String(item),
        specSection: obj.specSection as string | undefined,
        affectedTasks: obj.affectedTasks as string[] | undefined,
        suggestedFix: obj.suggestedFix as string | undefined,
      };
    }

    return {
      id: `auto-${index}`,
      severity: 'warning' as const,
      description: String(item),
    };
  });
}

function parsePromptResponse(
  promptDef: PromptDefinition,
  response: string,
  durationMs: number
): FocusedPromptResult {
  // Find ALL json code blocks and search from the end (model response is last)
  const allMatches = [...response.matchAll(/```json\s*([\s\S]*?)\s*```/g)];

  if (allMatches.length === 0) {
    return createParseFailureResult(promptDef, 'Could not parse structured response', response, durationMs);
  }

  // Search from the end for a valid JSON with verdict field
  for (let i = allMatches.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(allMatches[i][1]);
      // Must have verdict field to be a valid review response
      if (parsed.verdict) {
        return {
          promptName: promptDef.name,
          category: promptDef.category,
          verdict: parsed.verdict as SpecReviewVerdict,
          issues: parseIssues(parsed.issues ?? []),
          suggestions: parseSuggestions(parsed.suggestions ?? [], promptDef.category),
          rawResponse: response,
          durationMs,
        };
      }
    } catch {
      // Continue to previous match
    }
  }

  return createParseFailureResult(promptDef, 'No valid review JSON found (missing verdict field)', response, durationMs);
}

function parseSuggestions(rawSuggestions: unknown[], category: string): SuggestionCard[] {
  if (!Array.isArray(rawSuggestions)) return [];

  return rawSuggestions.map((s) => {
    // Always generate a unique ID - don't rely on LLM-provided IDs which can collide
    const uniqueId = randomUUID();

    if (typeof s === 'string') {
      return {
        id: uniqueId,
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
      id: uniqueId,
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
  return result.issues.some(issue => issue.description === 'Review timed out');
}

/**
 * Runs the aggregation agent to deduplicate and synthesize review findings
 */
async function runAggregationAgent(
  specPath: string,
  results: FocusedPromptResult[],
  cwd: string,
  timeoutMs: number,
  logDir: string,
  engineName?: string,
  model?: string,
  onProgress?: (message: string) => void,
  streamCallbacks?: import('../claude/types.js').StreamCallbacks
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
    { engineName, model, disableTools: false, streamCallbacks, logDir }
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
    // Always generate unique IDs - don't rely on LLM-provided IDs which can collide
    const suggestions: SuggestionCard[] = (parsed.suggestions || []).map((s: Record<string, unknown>) => ({
      id: randomUUID(),
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
  const onProgress = options.onProgress ?? (() => {});

  // Extract spec ID and set up directories
  const specId = extractSpecId(specPath);
  const specStateDir = join(cwd, '.speki', 'specs', specId);
  const verdictsDir = join(specStateDir, 'verdicts');
  const logDir = options.logDir ?? join(specStateDir, 'logs');

  // Create directories
  await fs.mkdir(verdictsDir, { recursive: true });
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
  onProgress(`Running ${reviewPrompts.length} review prompts in parallel...`);
  onProgress(`Verdicts will be written to: ${verdictsDir}`);

  // Per-reviewer timeout (60 seconds per PRD constraint C4)
  const perReviewerTimeoutMs = Math.min(60000, timeoutMs);
  const prompts: Array<{ name: string; fullPrompt: string }> = [];

  // Build all prompts and run in parallel - agents write verdicts to files
  const promptTasks = reviewPrompts.map(async (promptDef): Promise<FocusedPromptResult | null> => {
    const verdictPath = join(verdictsDir, `${promptDef.name}.json`);
    let fullPrompt: string;

    // Special handling for story alignment prompt
    if (promptDef.name === 'tech_spec_story_alignment') {
      if (!parentUserStories || parentUserStories.length === 0) {
        onProgress(`${promptDef.name}: SKIPPED (no parent user stories)`);
        return null;
      }
      fullPrompt = buildStoryAlignmentPrompt(
        TECH_SPEC_STORY_ALIGNMENT_PROMPT,
        specContent,
        parentUserStories,
        codebaseContext
      );
      // Append file output instruction
      fullPrompt += buildFileOutputInstruction(verdictPath, promptDef.name, promptDef.category);
    } else {
      fullPrompt = buildPrompt(
        promptDef.template,
        specPath,
        codebaseContext,
        goldenStandard,
        verdictPath,
        promptDef.name,
        promptDef.category
      );
    }

    prompts.push({ name: promptDef.name, fullPrompt });
    onProgress(`Starting ${promptDef.name}...`);

    // Run prompt with per-reviewer timeout
    const startTime = Date.now();
    await runPromptWithFileOutput(promptDef, fullPrompt, cwd, perReviewerTimeoutMs, {
      engineName: options.engineName,
      model: options.model,
      disableTools: false,
      streamCallbacks: options.streamCallbacks,
      logDir,
    });
    const durationMs = Date.now() - startTime;

    // Read the verdict from the file the agent wrote
    const result = await readVerdictFile(verdictPath, promptDef, durationMs);

    if (isTimeoutResult(result)) {
      onProgress(`${promptDef.name}: TIMEOUT (${result.durationMs}ms)`);
    } else {
      onProgress(`${promptDef.name}: ${result.verdict} (${result.durationMs}ms)`);
    }

    return result;
  });

  // Run all prompts in parallel (C3: Reviews run in parallel for performance)
  const rawResults = await Promise.all(promptTasks);

  // Filter out null results (skipped prompts) and collect results
  const results: FocusedPromptResult[] = rawResults.filter((r): r is FocusedPromptResult => r !== null);
  const completedPromptNames = results.filter(r => !isTimeoutResult(r)).map(r => r.promptName);
  const didTimeout = results.some(r => isTimeoutResult(r));

  // Run aggregation agent to deduplicate and synthesize findings
  // Give it 2 minutes for aggregation (or 30s if any reviewer timed out)
  const aggregationTimeoutMs = didTimeout ? 30000 : 120000;
  const aggregationAgentResult = await runAggregationAgent(
    specPath,
    results,
    cwd,
    aggregationTimeoutMs,
    logDir,
    options.engineName,
    options.model,
    onProgress,
    options.streamCallbacks
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
function buildCategories(results: FocusedPromptResult[]): Record<string, { verdict: SpecReviewVerdict; issues: DecomposeIssue[] }> {
  const categories: Record<string, { verdict: SpecReviewVerdict; issues: DecomposeIssue[] }> = {};

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
  const missingRequirements: DecomposeIssue[] = [];
  const contradictions: DecomposeIssue[] = [];
  const dependencyErrors: DecomposeIssue[] = [];
  const duplicates: DecomposeIssue[] = [];
  const suggestions: string[] = [];

  let hasCritical = false;

  for (const result of results) {
    const issues = result.issues;

    // Check if any issues in this result have critical severity
    if (issues.some(issue => issue.severity === 'critical')) {
      hasCritical = true;
    }

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
    verdict: hasCritical ? 'FAIL' : 'PASS',
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
  const logDir = options.logDir ?? join(cwd, '.speki', 'logs');

  await fs.mkdir(logDir, { recursive: true });

  const promptTimeoutMs = Math.floor(timeoutMs / DECOMPOSE_PROMPTS.length);
  const results: FocusedPromptResult[] = [];

  for (const promptDef of DECOMPOSE_PROMPTS) {
    const fullPrompt = buildDecomposePrompt(promptDef.template, specContent, tasksJson);
    const result = await runPrompt(promptDef, fullPrompt, cwd, promptTimeoutMs, { disableTools: true, logDir });
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
