import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import { resolveCliPath } from '../cli-path.js';
import { gatherCodebaseContext } from './codebase-context.js';
import { aggregateResults } from './aggregator.js';
import { getReviewTimeout } from './timeout.js';
import {
  GOD_SPEC_DETECTION_PROMPT,
  REQUIREMENTS_COMPLETENESS_PROMPT,
  CLARITY_SPECIFICITY_PROMPT,
  TESTABILITY_PROMPT,
  SCOPE_VALIDATION_PROMPT,
} from './prompts.js';
import type { FocusedPromptResult, SpecReviewResult, CodebaseContext, SuggestionCard, SpecReviewVerdict } from '../../types/index.js';

export interface SpecReviewOptions {
  /** Timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Path to golden standard file (defaults to .ralph/standards/golden_standard_prd_deterministic_decomposable.md) */
  goldenStandardPath?: string;
  /** Directory for log files */
  logDir?: string;
}

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
  specContent: string,
  codebaseContext: CodebaseContext,
  goldenStandard: string
): string {
  const contextString = JSON.stringify(codebaseContext, null, 2);

  let prompt = template
    .replace('{specContent}', specContent)
    .replace('{codebaseContext}', contextString);

  if (goldenStandard) {
    prompt = `## GOLDEN STANDARD REFERENCE\n${goldenStandard}\n\n${prompt}`;
  }

  return prompt;
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

async function runPrompt(
  promptDef: PromptDefinition,
  fullPrompt: string,
  cwd: string,
  timeoutMs: number
): Promise<FocusedPromptResult> {
  const startTime = Date.now();
  const claudePath = resolveCliPath('claude');
  const args = ['--dangerously-skip-permissions', '--print', '--output-format', 'text'];

  return new Promise((resolve) => {
    let stdout = '';
    let timedOut = false;

    const claude = spawn(claudePath, args, {
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
      claude.kill('SIGTERM');
    }, timeoutMs);

    claude.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    claude.stdin.write(fullPrompt);
    claude.stdin.end();

    claude.on('close', () => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (timedOut) {
        resolve(createErrorResult(promptDef, 'Review timed out', stdout, durationMs));
        return;
      }

      resolve(parsePromptResponse(promptDef, stdout, durationMs));
    });

    claude.on('error', () => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      resolve(createErrorResult(promptDef, 'Failed to spawn Claude CLI', '', durationMs));
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
        section: '',
        textSnippet: '',
        issue: s,
        suggestedFix: '',
        status: 'pending' as const,
      };
    }

    const raw = s as Record<string, unknown>;
    return {
      id: (raw.id as string) ?? defaultId,
      category: (raw.category as string) ?? category,
      severity: (raw.severity as 'critical' | 'warning' | 'info') ?? 'info',
      section: (raw.section as string) ?? '',
      lineStart: raw.lineStart as number | undefined,
      lineEnd: raw.lineEnd as number | undefined,
      textSnippet: (raw.textSnippet as string) ?? '',
      issue: (raw.issue as string) ?? '',
      suggestedFix: (raw.suggestedFix as string) ?? '',
      status: 'pending' as const,
    };
  });
}

export async function runSpecReview(
  specPath: string,
  options: SpecReviewOptions = {}
): Promise<SpecReviewResult> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? getReviewTimeout();
  const logDir = options.logDir ?? join(cwd, '.ralph', 'logs');

  await fs.mkdir(logDir, { recursive: true });

  const specContent = await fs.readFile(specPath, 'utf-8');
  const specBasename = basename(specPath);
  const goldenStandard = await loadGoldenStandard(cwd, options.goldenStandardPath);
  const codebaseContext = await gatherCodebaseContext(dirname(specPath));

  const promptTimeoutMs = Math.floor(timeoutMs / STANDALONE_PROMPTS.length);
  const results: FocusedPromptResult[] = [];

  for (const promptDef of STANDALONE_PROMPTS) {
    const fullPrompt = buildPrompt(promptDef.template, specContent, codebaseContext, goldenStandard);
    const result = await runPrompt(promptDef, fullPrompt, cwd, promptTimeoutMs);
    results.push(result);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join(logDir, `spec-review-${specBasename}-${timestamp}.json`);
  const aggregatedResult = aggregateResults(results, codebaseContext, logPath, specPath);

  await fs.writeFile(logPath, JSON.stringify({
    specPath,
    timestamp: new Date().toISOString(),
    promptResults: results,
    aggregatedResult,
  }, null, 2));

  return aggregatedResult;
}
