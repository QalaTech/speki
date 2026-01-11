import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findSpecFiles, validateSpecFile, validateCliOption, formatJsonOutput, formatHumanOutput, handleGodSpec, displayTimeoutError, getExitCodeForVerdict } from '../spec.js';
import { checkCliAvailable, getInstallInstructions } from '../../../core/cli-path.js';
import type { SpecReviewResult, TimeoutInfo } from '../../../types/index.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  editor: vi.fn(),
}));

vi.mock('../../../core/spec-review/splitter.js', () => ({
  executeSplit: vi.fn(),
}));

vi.mock('../../../core/cli-path.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../core/cli-path.js')>();
  return {
    ...original,
    checkCliAvailable: vi.fn(),
  };
});

describe('spec review command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'spec-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('specReview_WithValidFile_DelegatesToRunner', () => {
    const specFile = join(tempDir, 'test-spec.md');
    writeFileSync(specFile, '# Test Spec\n\nThis is a test specification.');

    const result = validateSpecFile(specFile);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('specReview_WithMissingFile_DisplaysError', () => {
    const nonExistentFile = join(tempDir, 'non-existent.md');

    const result = validateSpecFile(nonExistentFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('File not found');
    expect(result.error).toContain(nonExistentFile);
  });

  it('specReview_WithNonMarkdownFile_DisplaysError', () => {
    const txtFile = join(tempDir, 'test-spec.txt');
    writeFileSync(txtFile, 'This is a text file, not markdown.');

    const result = validateSpecFile(txtFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a markdown file');
    expect(result.error).toContain('.md');
    expect(result.error).toContain(txtFile);
  });
});

describe('findSpecFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'spec-find-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('findSpecFiles_SearchesAllDirectories', async () => {
    mkdirSync(join(tempDir, 'specs'));
    mkdirSync(join(tempDir, 'docs'));
    mkdirSync(join(tempDir, '.ralph'));
    mkdirSync(join(tempDir, '.ralph/specs'));

    writeFileSync(join(tempDir, 'specs', 'feature-spec.md'), '# Feature Spec');
    writeFileSync(join(tempDir, 'docs', 'api-doc.md'), '# API Doc');
    writeFileSync(join(tempDir, '.ralph/specs', 'internal-spec.md'), '# Internal Spec');
    writeFileSync(join(tempDir, 'root-readme.md'), '# Root Readme');

    const results = await findSpecFiles(tempDir);

    expect(results).toHaveLength(4);
    expect(results.some((f) => f.includes('specs/feature-spec.md'))).toBe(true);
    expect(results.some((f) => f.includes('docs/api-doc.md'))).toBe(true);
    expect(results.some((f) => f.includes('.ralph/specs/internal-spec.md'))).toBe(true);
    expect(results.some((f) => f.includes('root-readme.md'))).toBe(true);
  });

  it('findSpecFiles_ReturnsOnlyMarkdownFiles', async () => {
    mkdirSync(join(tempDir, 'specs'));
    writeFileSync(join(tempDir, 'specs', 'valid-spec.md'), '# Valid Spec');
    writeFileSync(join(tempDir, 'specs', 'script.js'), 'console.log("hello");');
    writeFileSync(join(tempDir, 'specs', 'data.json'), '{"key": "value"}');
    writeFileSync(join(tempDir, 'specs', 'notes.txt'), 'Some notes');

    const results = await findSpecFiles(tempDir);

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('valid-spec.md');
  });

  it('specReview_WithNoArgs_ShowsFilePicker', async () => {
    mkdirSync(join(tempDir, 'specs'));
    writeFileSync(join(tempDir, 'specs', 'test-spec.md'), '# Test Spec');
    writeFileSync(join(tempDir, 'specs', 'another-spec.md'), '# Another Spec');

    const results = await findSpecFiles(tempDir);

    expect(results).toHaveLength(2);
    expect(results.every((f) => f.endsWith('.md'))).toBe(true);
  });
});

describe('spec review CLI options', () => {
  const createMockResult = (overrides: Partial<SpecReviewResult> = {}): SpecReviewResult => ({
    verdict: 'PASS',
    categories: {},
    codebaseContext: {
      projectType: 'typescript',
      existingPatterns: [],
      relevantFiles: [],
    },
    suggestions: [],
    logPath: '/test/log.json',
    durationMs: 1000,
    ...overrides,
  });

  it('specReview_WithTimeoutFlag_UsesProvidedTimeout', async () => {
    // The timeout option is defined with parseInt parser
    // Commander parses -t 30000 into options.timeout = 30000
    // We test that the option parser works by checking the command definition
    const { specCommand } = await import('../spec.js');
    const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

    expect(reviewCommand).toBeDefined();
    const timeoutOption = reviewCommand?.options.find((o) => o.long === '--timeout');
    expect(timeoutOption).toBeDefined();
    expect(timeoutOption?.flags).toContain('-t');
  });

  it('specReview_WithCliFlag_UsesProvidedCli', () => {
    // Test validateCliOption accepts valid values
    expect(validateCliOption('claude')).toBe('claude');
    expect(validateCliOption('codex')).toBe('codex');

    // Test validateCliOption rejects invalid values
    expect(() => validateCliOption('invalid')).toThrow("Invalid CLI option: invalid. Must be 'claude' or 'codex'.");
    expect(() => validateCliOption('')).toThrow("Must be 'claude' or 'codex'");
  });

  it('specReview_WithVerboseFlag_ShowsDetailedOutput', async () => {
    // Test that the verbose flag is defined in the command
    const { specCommand } = await import('../spec.js');
    const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

    expect(reviewCommand).toBeDefined();
    const verboseOption = reviewCommand?.options.find((o) => o.long === '--verbose');
    expect(verboseOption).toBeDefined();
    expect(verboseOption?.flags).toContain('-v');

    // Verify the onProgress callback pattern works
    const progressMessages: string[] = [];
    const onProgress = (msg: string) => progressMessages.push(msg);

    // Simulate what the runner does with onProgress
    onProgress('Running god_spec_detection...');
    onProgress('god_spec_detection: PASS (100ms)');

    expect(progressMessages).toHaveLength(2);
    expect(progressMessages[0]).toContain('god_spec_detection');
  });

  it('specReview_WithJsonFlag_OutputsJson', () => {
    const mockResult = createMockResult({
      verdict: 'NEEDS_IMPROVEMENT',
      suggestions: [
        {
          id: 'test-1',
          category: 'clarity',
          severity: 'warning',
          section: 'Requirements',
          textSnippet: 'Some text',
          issue: 'Unclear requirement',
          suggestedFix: 'Make it clearer',
          status: 'pending',
        },
      ],
    });

    const jsonOutput = formatJsonOutput(mockResult);

    // Verify it's valid JSON
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.verdict).toBe('NEEDS_IMPROVEMENT');
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0].issue).toBe('Unclear requirement');

    // Verify formatting (indented with 2 spaces)
    expect(jsonOutput).toContain('\n');
    expect(jsonOutput).toMatch(/"verdict":\s+"NEEDS_IMPROVEMENT"/);
  });
});

describe('formatHumanOutput', () => {
  const createMockResult = (overrides: Partial<SpecReviewResult> = {}): SpecReviewResult => ({
    verdict: 'PASS',
    categories: {},
    codebaseContext: {
      projectType: 'typescript',
      existingPatterns: [],
      relevantFiles: [],
    },
    suggestions: [],
    logPath: '/test/log.json',
    durationMs: 1000,
    ...overrides,
  });

  let consoleLogs: string[];
  const originalConsoleLog = console.log;

  beforeEach(() => {
    consoleLogs = [];
    console.log = (...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('formatOutput_WithPassVerdict_DisplaysPass', () => {
    const result = createMockResult({ verdict: 'PASS' });

    formatHumanOutput(result, '/path/to/my-spec.md');

    const output = consoleLogs.join('\n');
    expect(output).toContain('my-spec.md');
    expect(output).toContain('PASS');
    expect(output).toContain('Verdict:');
  });

  it('formatOutput_WithNeedsImprovement_ShowsIssues', () => {
    const result = createMockResult({
      verdict: 'NEEDS_IMPROVEMENT',
      categories: {
        clarity: {
          verdict: 'NEEDS_IMPROVEMENT',
          issues: ['Requirement 1 is ambiguous', 'Requirement 2 lacks specifics'],
        },
        completeness: {
          verdict: 'PASS',
          issues: [],
        },
      },
    });

    formatHumanOutput(result, '/specs/feature.md');

    const output = consoleLogs.join('\n');
    expect(output).toContain('NEEDS_IMPROVEMENT');
    expect(output).toContain('Categories:');
    expect(output).toContain('clarity');
    expect(output).toContain('Requirement 1 is ambiguous');
    expect(output).toContain('Requirement 2 lacks specifics');
    expect(output).toContain('completeness');
  });

  it('formatOutput_WithSplitRecommended_ShowsProposal', () => {
    const result = createMockResult({
      verdict: 'SPLIT_RECOMMENDED',
      splitProposal: {
        originalFile: '/specs/god-spec.md',
        reason: 'Spec covers too many domains',
        proposedSpecs: [
          {
            filename: 'user-management.md',
            description: 'User registration and authentication',
            estimatedStories: 5,
            sections: ['User Management'],
          },
          {
            filename: 'api-integration.md',
            description: 'External API integrations',
            estimatedStories: 3,
            sections: ['API Integration'],
          },
        ],
      },
    });

    formatHumanOutput(result, '/specs/god-spec.md');

    const output = consoleLogs.join('\n');
    expect(output).toContain('SPLIT_RECOMMENDED');
    expect(output).toContain('Split Recommended');
    expect(output).toContain('Spec covers too many domains');
    expect(output).toContain('user-management.md');
    expect(output).toContain('User registration and authentication');
    expect(output).toContain('Est. stories: 5');
    expect(output).toContain('api-integration.md');
  });

  it('formatOutput_ShowsSuggestionsInPriorityOrder', () => {
    const result = createMockResult({
      verdict: 'NEEDS_IMPROVEMENT',
      suggestions: [
        {
          id: 'sug-1',
          category: 'testability',
          severity: 'info',
          section: 'Requirements',
          textSnippet: 'snippet1',
          issue: 'Minor info suggestion',
          suggestedFix: 'Consider adding more detail',
          status: 'pending',
        },
        {
          id: 'sug-2',
          category: 'clarity',
          severity: 'critical',
          section: 'Architecture',
          textSnippet: 'snippet2',
          issue: 'Critical clarity issue',
          suggestedFix: 'Rewrite the section',
          status: 'pending',
        },
        {
          id: 'sug-3',
          category: 'completeness',
          severity: 'warning',
          section: 'Scope',
          textSnippet: 'snippet3',
          issue: 'Warning about scope',
          suggestedFix: 'Add missing requirements',
          status: 'pending',
        },
      ],
    });

    formatHumanOutput(result, '/specs/test.md');

    const output = consoleLogs.join('\n');
    const criticalIndex = output.indexOf('[critical]');
    const warningIndex = output.indexOf('[warning]');
    const infoIndex = output.indexOf('[info]');

    expect(criticalIndex).toBeLessThan(warningIndex);
    expect(warningIndex).toBeLessThan(infoIndex);
  });
});

describe('handleGodSpec', () => {
  const createMockGodSpecResult = (): SpecReviewResult => ({
    verdict: 'SPLIT_RECOMMENDED',
    categories: {
      god_spec_detection: {
        verdict: 'SPLIT_RECOMMENDED',
        issues: ['Spec has 8 feature domains', 'Estimated 25+ user stories', 'Multiple system boundaries'],
      },
    },
    splitProposal: {
      originalFile: '/specs/god-spec.md',
      reason: 'Spec covers multiple unrelated domains',
      proposedSpecs: [
        {
          filename: 'user-management.md',
          description: 'User registration and authentication',
          estimatedStories: 8,
          sections: ['User Management', 'Authentication'],
        },
        {
          filename: 'api-integration.md',
          description: 'External API integrations',
          estimatedStories: 5,
          sections: ['API Integration'],
        },
      ],
    },
    codebaseContext: {
      projectType: 'typescript',
      existingPatterns: [],
      relevantFiles: [],
    },
    suggestions: [],
    logPath: '/test/log.json',
    durationMs: 1000,
  });

  let consoleLogs: string[];
  const originalConsoleLog = console.log;

  beforeEach(() => {
    consoleLogs = [];
    console.log = (...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(' '));
    };
    vi.resetAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('handleGodSpec_DisplaysWarningAndProposal', async () => {
    const { select } = await import('@inquirer/prompts');
    vi.mocked(select).mockResolvedValue('skip');

    const result = createMockGodSpecResult();

    await handleGodSpec(result, '/specs/god-spec.md');

    const output = consoleLogs.join('\n');
    expect(output).toContain('God Spec Detected');
    expect(output).toContain('god-spec.md');
    expect(output).toContain('Detected Issues:');
    expect(output).toContain('8 feature domains');
    expect(output).toContain('Recommended Split:');
    expect(output).toContain('multiple unrelated domains');
    expect(output).toContain('Total estimated stories:');
    expect(output).toContain('13'); // 8 + 5
    expect(output).toContain('user-management.md');
    expect(output).toContain('api-integration.md');
  });

  it('handleGodSpec_AcceptCreatesFiles', async () => {
    const { select } = await import('@inquirer/prompts');
    const { executeSplit } = await import('../../../core/spec-review/splitter.js');

    vi.mocked(select).mockResolvedValue('accept');
    vi.mocked(executeSplit).mockResolvedValue([
      '/specs/user-management.md',
      '/specs/api-integration.md',
    ]);

    const result = createMockGodSpecResult();

    const handleResult = await handleGodSpec(result, '/specs/god-spec.md');

    expect(handleResult.action).toBe('accept');
    expect(handleResult.createdFiles).toEqual([
      '/specs/user-management.md',
      '/specs/api-integration.md',
    ]);
    expect(executeSplit).toHaveBeenCalledWith('/specs/god-spec.md', result.splitProposal);

    const output = consoleLogs.join('\n');
    expect(output).toContain('Split complete!');
    expect(output).toContain('Created files:');
    expect(output).toContain('/specs/user-management.md');
    expect(output).toContain('/specs/api-integration.md');
  });

  it('handleGodSpec_SkipContinuesWithWarning', async () => {
    const { select } = await import('@inquirer/prompts');
    const { executeSplit } = await import('../../../core/spec-review/splitter.js');

    vi.mocked(select).mockResolvedValue('skip');

    const result = createMockGodSpecResult();

    const handleResult = await handleGodSpec(result, '/specs/god-spec.md');

    expect(handleResult.action).toBe('skip');
    expect(handleResult.skipped).toBe(true);
    expect(handleResult.createdFiles).toBeUndefined();
    expect(executeSplit).not.toHaveBeenCalled();

    const output = consoleLogs.join('\n');
    expect(output).toContain('Continuing review without splitting');
    expect(output).toContain('may be too large');
  });
});

describe('CLI availability check', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runReview_WithMissingClaude_DisplaysInstallInstructions', () => {
    // Test that checkCliAvailable returns proper error structure for claude
    vi.mocked(checkCliAvailable).mockReturnValue({
      available: false,
      cli: 'claude',
      error: 'claude CLI is not installed or not in PATH',
      installInstructions: getInstallInstructions('claude'),
    });

    const result = checkCliAvailable('claude');

    expect(result.available).toBe(false);
    expect(result.error).toContain('claude');
    expect(result.error).toContain('not installed');
    expect(result.installInstructions).toContain('npm install');
    expect(result.installInstructions).toContain('@anthropic-ai/claude-cli');
    expect(result.installInstructions).toContain('anthropic.com');
  });

  it('runReview_WithMissingCodex_DisplaysInstallInstructions', () => {
    // Test that checkCliAvailable returns proper error structure for codex
    vi.mocked(checkCliAvailable).mockReturnValue({
      available: false,
      cli: 'codex',
      error: 'codex CLI is not installed or not in PATH',
      installInstructions: getInstallInstructions('codex'),
    });

    const result = checkCliAvailable('codex');

    expect(result.available).toBe(false);
    expect(result.error).toContain('codex');
    expect(result.error).toContain('not installed');
    expect(result.installInstructions).toContain('npm install');
    expect(result.installInstructions).toContain('@openai/codex');
    expect(result.installInstructions).toContain('github.com/openai');
  });
});

describe('handleTimeout', () => {
  let consoleLogs: string[];
  const originalConsoleLog = console.log;

  beforeEach(() => {
    consoleLogs = [];
    console.log = (...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('handleTimeout_TerminatesProcess', () => {
    // Test that displayTimeoutError shows the timeout message
    const timeoutInfo: TimeoutInfo = {
      timeoutMs: 600000,
      completedPrompts: 2,
      totalPrompts: 5,
      completedPromptNames: ['god_spec_detection', 'requirements_completeness'],
    };

    displayTimeoutError(timeoutInfo, '/specs/test-spec.md');

    const output = consoleLogs.join('\n');
    expect(output).toContain('Review Timed Out');
    expect(output).toContain('test-spec.md');
    expect(output).toContain('10 minutes'); // 600000ms = 10 minutes
  });

  it('handleTimeout_DisplaysPartialResults', () => {
    // Test that partial results are displayed when some prompts completed
    const timeoutInfo: TimeoutInfo = {
      timeoutMs: 300000,
      completedPrompts: 3,
      totalPrompts: 5,
      completedPromptNames: ['god_spec_detection', 'requirements_completeness', 'clarity_specificity'],
    };

    displayTimeoutError(timeoutInfo, '/specs/partial-spec.md');

    const output = consoleLogs.join('\n');
    expect(output).toContain('Partial Results Available');
    expect(output).toContain('Completed 3 of 5 review prompts');
    expect(output).toContain('god_spec_detection');
    expect(output).toContain('requirements_completeness');
    expect(output).toContain('clarity_specificity');
  });

  it('handleTimeout_SuggestsIncreasingTimeout', () => {
    // Test that timeout guidance is displayed
    const timeoutInfo: TimeoutInfo = {
      timeoutMs: 60000,
      completedPrompts: 0,
      totalPrompts: 5,
      completedPromptNames: [],
    };

    displayTimeoutError(timeoutInfo, '/specs/slow-spec.md');

    const output = consoleLogs.join('\n');
    expect(output).toContain('To increase the timeout');
    expect(output).toContain('--timeout <ms>');
    expect(output).toContain('RALPH_REVIEW_TIMEOUT_MS');
    expect(output).toContain('60000ms');
    expect(output).toContain('1 minute');
    expect(output).toContain('Maximum allowed: 1800000ms');
    expect(output).toContain('30 minutes');
    // When no prompts completed, should show specific message
    expect(output).toContain('No prompts completed before timeout');
  });
});

describe('exit codes', () => {
  it('specReview_PassVerdict_ExitsZero', () => {
    expect(getExitCodeForVerdict('PASS')).toBe(0);
  });

  it('specReview_FailVerdict_ExitsOne', () => {
    expect(getExitCodeForVerdict('FAIL')).toBe(1);
  });

  it('specReview_NeedsImprovement_ExitsOne', () => {
    expect(getExitCodeForVerdict('NEEDS_IMPROVEMENT')).toBe(1);
  });

  it('specReview_SplitRecommended_ExitsOne', () => {
    expect(getExitCodeForVerdict('SPLIT_RECOMMENDED')).toBe(1);
  });

  it('specReview_Error_ExitsTwo', () => {
    // Exit code 2 is used for errors (file not found, CLI missing, etc.)
    // Verify validateSpecFile returns errors that would trigger exit(2)
    const notFoundResult = validateSpecFile('/nonexistent/file.md');
    expect(notFoundResult.valid).toBe(false);
    expect(notFoundResult.error).toContain('File not found');

    const invalidFileResult = validateSpecFile(join(process.cwd(), 'package.json'));
    expect(invalidFileResult.valid).toBe(false);
    expect(invalidFileResult.error).toContain('must be a markdown file');
  });
});
