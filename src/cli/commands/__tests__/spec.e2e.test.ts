import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { SpecReviewResult, TimeoutInfo } from '../../../types/index.js';

// Mock the runner to avoid actual LLM calls
const mockRunSpecReview = vi.fn();
vi.mock('../../../core/spec-review/runner.js', () => ({
  runSpecReview: mockRunSpecReview,
}));

// Mock CLI availability check
vi.mock('../../../core/cli-path.js', () => ({
  checkCliAvailable: vi.fn(() => ({ available: true, command: 'claude' })),
  resolveCliPath: vi.fn(() => '/usr/local/bin/claude'),
  getInstallInstructions: vi.fn(() => 'Install instructions'),
}));

// Mock chalk to remove ANSI codes in tests
// chalk uses a fluent API where chalk.bold is both a function and has color methods
vi.mock('chalk', () => {
  const passthrough = (s: string) => s;

  // Create a function that also has color properties (no nested bold to avoid recursion)
  const createStyler = () => {
    const fn = ((s: string) => s) as ((s: string) => string) & Record<string, (s: string) => string>;
    fn.red = passthrough;
    fn.green = passthrough;
    fn.blue = passthrough;
    fn.yellow = passthrough;
    fn.gray = passthrough;
    fn.cyan = passthrough;
    fn.magenta = passthrough;
    return fn;
  };

  const chalk = {
    red: passthrough,
    green: passthrough,
    blue: passthrough,
    yellow: passthrough,
    gray: passthrough,
    cyan: passthrough,
    magenta: passthrough,
    bold: createStyler(),
  };

  return { default: chalk };
});

// Mock inquirer prompts for file picker
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  editor: vi.fn(),
}));

describe('E2E: CLI spec review', () => {
  let tempDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];

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

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'spec-e2e-'));
    exitCode = undefined;
    consoleOutput = [];
    consoleErrors = [];

    // Mock process.exit - capture only the FIRST exit code
    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => {
      if (exitCode === undefined) {
        exitCode = code ?? 0;
      }
      throw new Error(`process.exit(${code})`);
    }) as never;

    // Mock process.cwd to return temp directory
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    // Capture console output
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.map(String).join(' '));
    });

    // Reset the mock
    mockRunSpecReview.mockReset();

    // Reset module cache to get fresh commander instance each test
    vi.resetModules();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.spyOn(process, 'cwd').mockRestore();
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('e2e_specReview_ValidFile_CompletesSuccessfully', () => {
    it('should complete review with PASS verdict and exit code 0', async () => {
      // Arrange
      const specFile = join(tempDir, 'valid-spec.md');
      writeFileSync(specFile, '# Valid Spec\n\nThis is a valid specification.');

      const mockResult = createMockResult({ verdict: 'PASS' });
      mockRunSpecReview.mockResolvedValue(mockResult);

      // Import the spec command and action
      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile]);
      } catch (e) {
        // Expected: process.exit throws
        // Debug: check error
        if (!(e instanceof Error) || !e.message.includes('process.exit')) {
          console.error('Unexpected error:', e);
        }
      }

      // Assert
      expect(exitCode).toBe(0);
      expect(mockRunSpecReview).toHaveBeenCalledWith(
        specFile,
        expect.objectContaining({
          cwd: tempDir,
        })
      );
    });

    it('should complete review with NEEDS_IMPROVEMENT verdict and exit code 1', async () => {
      // Arrange
      const specFile = join(tempDir, 'needs-improvement.md');
      writeFileSync(specFile, '# Needs Improvement\n\nThis spec needs work.');

      const mockResult = createMockResult({
        verdict: 'NEEDS_IMPROVEMENT',
        suggestions: [
          {
            id: 'sug-1',
            category: 'clarity',
            severity: 'warning',
            section: 'Overview',
            textSnippet: 'needs work',
            issue: 'Vague description',
            suggestedFix: 'Add more details',
            status: 'pending',
          },
        ],
      });
      mockRunSpecReview.mockResolvedValue(mockResult);

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile]);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(1);
    });
  });

  describe('e2e_specReview_MissingFile_ReturnsError', () => {
    it('should exit with code 2 for non-existent file', async () => {
      // Arrange
      const nonExistentFile = join(tempDir, 'does-not-exist.md');

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', nonExistentFile]);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(2);
      expect(consoleErrors.some((e) => e.includes('File not found'))).toBe(true);
    });

    it('should exit with code 2 for non-markdown file', async () => {
      // Arrange
      const txtFile = join(tempDir, 'test.txt');
      writeFileSync(txtFile, 'Not a markdown file');

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', txtFile]);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(2);
      expect(consoleErrors.some((e) => e.includes('markdown'))).toBe(true);
    });
  });

  describe('e2e_specReview_JsonOutput_ValidJson', () => {
    it('should output valid JSON with --json flag', async () => {
      // Arrange
      const specFile = join(tempDir, 'json-output.md');
      writeFileSync(specFile, '# JSON Output Test\n\nTest spec for JSON output.');

      const mockResult = createMockResult({
        verdict: 'PASS',
        suggestions: [
          {
            id: 'json-1',
            category: 'completeness',
            severity: 'info',
            section: 'Overview',
            textSnippet: 'Test spec',
            issue: 'Consider adding details',
            suggestedFix: 'Add more context',
            status: 'pending',
          },
        ],
      });
      mockRunSpecReview.mockResolvedValue(mockResult);

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile, '--json']);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(0);

      // Find the JSON output in console.log calls
      const jsonOutput = consoleOutput.find((line) => line.startsWith('{'));
      expect(jsonOutput).toBeDefined();

      // Verify it's valid JSON
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.verdict).toBe('PASS');
      expect(parsed.suggestions).toHaveLength(1);
      expect(parsed.suggestions[0].id).toBe('json-1');
    });

    it('should output JSON even on timeout with --json flag', async () => {
      // Arrange
      const specFile = join(tempDir, 'timeout-json.md');
      writeFileSync(specFile, '# Timeout JSON Test\n\nTest spec.');

      const mockResult = createMockResult({
        verdict: 'PASS',
        timeoutInfo: {
                    timeoutMs: 300000,
          completedPrompts: 2,
          totalPrompts: 5,
          completedPromptNames: ['god_spec_detection', 'clarity_check'],
        },
      });
      mockRunSpecReview.mockResolvedValue(mockResult);

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile, '--json']);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(2);

      const jsonOutput = consoleOutput.find((line) => line.startsWith('{'));
      expect(jsonOutput).toBeDefined();

      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.timeoutInfo).toBeDefined();
      expect(parsed.timeoutInfo.timeoutMs).toBe(300000);
    });
  });

  describe('e2e_specReview_Timeout_HandlesGracefully', () => {
    it('should exit with code 2 and display timeout message', async () => {
      // Arrange
      const specFile = join(tempDir, 'timeout-spec.md');
      writeFileSync(specFile, '# Timeout Test\n\nThis spec will timeout.');

      const timeoutInfo: TimeoutInfo = {
                timeoutMs: 300000,
        completedPrompts: 3,
        totalPrompts: 5,
        completedPromptNames: ['god_spec_detection', 'clarity_check', 'completeness_check'],
      };

      const mockResult = createMockResult({
        verdict: 'PASS',
        timeoutInfo,
      });
      mockRunSpecReview.mockResolvedValue(mockResult);

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile]);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(2);
      expect(consoleOutput.some((line) => line.includes('Timed Out'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('5 minutes'))).toBe(true);
    });

    it('should show partial results when some prompts completed', async () => {
      // Arrange
      const specFile = join(tempDir, 'partial-timeout.md');
      writeFileSync(specFile, '# Partial Timeout\n\nTest partial results.');

      const timeoutInfo: TimeoutInfo = {
                timeoutMs: 300000,
        completedPrompts: 2,
        totalPrompts: 5,
        completedPromptNames: ['god_spec_detection', 'clarity_check'],
      };

      const mockResult = createMockResult({
        verdict: 'NEEDS_IMPROVEMENT',
        timeoutInfo,
        suggestions: [
          {
            id: 'partial-1',
            category: 'clarity',
            severity: 'warning',
            section: 'Overview',
            textSnippet: 'partial',
            issue: 'Found during partial review',
            suggestedFix: 'Fix this',
            status: 'pending',
          },
        ],
      });
      mockRunSpecReview.mockResolvedValue(mockResult);

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile]);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(2);
      expect(consoleOutput.some((line) => line.includes('Partial'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('god_spec_detection'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('clarity_check'))).toBe(true);
    });

    it('should pass timeout option to runner', async () => {
      // Arrange
      const specFile = join(tempDir, 'custom-timeout.md');
      writeFileSync(specFile, '# Custom Timeout\n\nTest custom timeout.');

      const mockResult = createMockResult({ verdict: 'PASS' });
      mockRunSpecReview.mockResolvedValue(mockResult);

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile, '--timeout', '60000']);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(mockRunSpecReview).toHaveBeenCalledWith(
        specFile,
        expect.objectContaining({
          timeoutMs: 60000,
        })
      );
    });
  });

  describe('Exit codes for each verdict', () => {
    it.each([
      ['PASS', 0],
      ['NEEDS_IMPROVEMENT', 1],
      ['FAIL', 1],
      ['SPLIT_RECOMMENDED', 1],
    ])('should exit with code %s for verdict %s', async (verdict, expectedCode) => {
      // Arrange
      const specFile = join(tempDir, `verdict-${verdict.toLowerCase()}.md`);
      writeFileSync(specFile, `# ${verdict} Test\n\nTest spec.`);

      const mockResult = createMockResult({ verdict: verdict as SpecReviewResult['verdict'] });
      mockRunSpecReview.mockResolvedValue(mockResult);

      const { specCommand } = await import('../spec.js');
      const reviewCommand = specCommand.commands.find((c) => c.name() === 'review');

      // Act
      try {
        await reviewCommand?.parseAsync(['node', 'qala', specFile, '--json']);
      } catch (e) {
        // Expected: process.exit throws
      }

      // Assert
      expect(exitCode).toBe(expectedCode);
    });
  });
});
