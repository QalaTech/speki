import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import { resolveCliPath } from '../cli-path.js';
import { gatherCodebaseContext } from './codebase-context.js';
import { aggregateResults } from './aggregator.js';
import { getReviewTimeout } from './timeout.js';
import { saveReviewLog } from './review-logger.js';
import {
  GOD_SPEC_DETECTION_PROMPT,
  REQUIREMENTS_COMPLETENESS_PROMPT,
  CLARITY_SPECIFICITY_PROMPT,
  TESTABILITY_PROMPT,
  SCOPE_VALIDATION_PROMPT,
  MISSING_REQUIREMENTS_PROMPT,
  CONTRADICTIONS_PROMPT,
  DEPENDENCY_VALIDATION_PROMPT,
  DUPLICATE_DETECTION_PROMPT,
} from './prompts.js';
import type { FocusedPromptResult, SpecReviewResult, CodebaseContext, SuggestionCard, SuggestionType, SpecReviewVerdict, ReviewFeedback, CliType, TimeoutInfo } from '../../types/index.js';

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
}

// Re-export TimeoutInfo for convenience
export type { TimeoutInfo } from '../../types/index.js';

interface PromptDefinition {
  name: string;
  category: string;
  template: string;
}

const STANDALONE_PROMPTS: PromptDefinition[] = [
  { name: 'god_spec_detection', category: 'scope', template: GOD_SPEC_DETECTION_PROMPT },
  { name: 'requirements_completeness', category: 'completeness', template: REQUIREMENTS_COMPLETENESS_PROMPT },
  { name: 'clarity_specificity', category: 'clarity', template: CLARITY_SPECIFICITY_PROMPT },
  { name: 'testability', category: 'testability', template: TESTABILITY_PROMPT },
  { name: 'scope_validation', category: 'scope_alignment', template: SCOPE_VALIDATION_PROMPT },
];

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
  const cliType = options.cli ?? 'claude';
  const cliPath = resolveCliPath(cliType);
  const args = ['--dangerously-skip-permissions', '--print', '--output-format', 'text'];

  if (options.disableTools) {
    args.push('--tools', '');
  }

  return new Promise((resolve) => {
    let stdout = '';
    let timedOut = false;
    let sigkillTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const cliProcess = spawn(cliPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      cliProcess.kill('SIGTERM');

      // If process doesn't exit within 5 seconds, send SIGKILL
      sigkillTimeoutId = setTimeout(() => {
        cliProcess.kill('SIGKILL');
      }, SIGKILL_DELAY_MS);
    }, timeoutMs);

    cliProcess.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    cliProcess.stdin.write(fullPrompt);
    cliProcess.stdin.end();

    cliProcess.on('close', () => {
      clearTimeout(timeoutId);
      if (sigkillTimeoutId) {
        clearTimeout(sigkillTimeoutId);
      }
      const durationMs = Date.now() - startTime;

      if (timedOut) {
        resolve(createErrorResult(promptDef, 'Review timed out', stdout, durationMs));
        return;
      }

      resolve(parsePromptResponse(promptDef, stdout, durationMs));
    });

    cliProcess.on('error', () => {
      clearTimeout(timeoutId);
      if (sigkillTimeoutId) {
        clearTimeout(sigkillTimeoutId);
      }
      const durationMs = Date.now() - startTime;
      resolve(createErrorResult(promptDef, `Failed to spawn ${cliType} CLI`, '', durationMs));
    });
  });
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

  onProgress(`Loaded spec: ${specBasename}`);
  onProgress(`Running ${STANDALONE_PROMPTS.length} review prompts...`);

  const promptTimeoutMs = Math.floor(timeoutMs / STANDALONE_PROMPTS.length);
  const results: FocusedPromptResult[] = [];
  const prompts: Array<{ name: string; fullPrompt: string }> = [];
  const completedPromptNames: string[] = [];
  let didTimeout = false;

  for (const promptDef of STANDALONE_PROMPTS) {
    onProgress(`Running ${promptDef.name}...`);
    const fullPrompt = buildPrompt(promptDef.template, specPath, codebaseContext, goldenStandard);
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

  const aggregatedResult = aggregateResults(results, codebaseContext, '', specPath);

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
      totalPrompts: STANDALONE_PROMPTS.length,
      completedPromptNames,
    };
  }

  return finalResult;
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
