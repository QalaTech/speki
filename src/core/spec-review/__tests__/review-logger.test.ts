/**
 * Tests for review-logger.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { saveReviewLog, ReviewLogInput } from '../review-logger.js';
import type { FocusedPromptResult, SpecReviewResult, SuggestionCard } from '../../../types/index.js';

function createMockSuggestion(overrides: Partial<SuggestionCard> = {}): SuggestionCard {
  return {
    id: 'sugg-1',
    category: 'testability',
    severity: 'warning',
    section: 'Requirements',
    textSnippet: '',
    issue: 'Test issue',
    suggestedFix: 'Test fix',
    status: 'pending',
    ...overrides,
  };
}

function createMockPromptResult(overrides: Partial<FocusedPromptResult> = {}): FocusedPromptResult {
  return {
    promptName: 'test_prompt',
    category: 'testability',
    verdict: 'PASS',
    issues: [],
    suggestions: [],
    durationMs: 1000,
    rawResponse: '{"verdict": "PASS"}',
    ...overrides,
  };
}

function createMockAggregatedResult(overrides: Partial<SpecReviewResult> = {}): SpecReviewResult {
  return {
    verdict: 'PASS',
    categories: {},
    suggestions: [],
    codebaseContext: {
      projectType: 'nodejs',
      existingPatterns: [],
      relevantFiles: [],
    },
    logPath: '/test/log.json',
    durationMs: 5000,
    ...overrides,
  };
}

function createMockInput(overrides: Partial<ReviewLogInput> = {}): ReviewLogInput {
  return {
    specPath: '/test/specs/test-spec.md',
    promptResults: [createMockPromptResult()],
    aggregatedResult: createMockAggregatedResult(),
    ...overrides,
  };
}

describe('review-logger', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `review-logger-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('saveReviewLog', () => {
    it('saveReviewLog_CreatesLogFile', async () => {
      // Arrange
      const logDir = path.join(testDir, '.speki', 'logs');
      const input = createMockInput();

      // Act
      const result = await saveReviewLog(logDir, input);

      // Assert
      const logExists = await fs.stat(result.logFile).then(() => true).catch(() => false);
      expect(logExists).toBe(true);

      const logContent = await fs.readFile(result.logFile, 'utf-8');
      expect(logContent).toContain('SPEC REVIEW LOG');
      expect(logContent).toContain('test-spec.md');
      expect(logContent).toContain('Overall Verdict: PASS');
    });

    it('saveReviewLog_CreatesPromptsDirectory', async () => {
      // Arrange
      const logDir = path.join(testDir, '.speki', 'logs');
      const input = createMockInput({
        promptResults: [
          createMockPromptResult({ promptName: 'god_spec_detection' }),
          createMockPromptResult({ promptName: 'requirements_completeness' }),
        ],
        prompts: [
          { name: 'god_spec_detection', fullPrompt: 'Test prompt 1' },
          { name: 'requirements_completeness', fullPrompt: 'Test prompt 2' },
        ],
      });

      // Act
      const result = await saveReviewLog(logDir, input);

      // Assert
      const dirExists = await fs.stat(result.promptsDir).then(s => s.isDirectory()).catch(() => false);
      expect(dirExists).toBe(true);

      const files = await fs.readdir(result.promptsDir);
      expect(files.length).toBe(2);
      expect(files.some(f => f.includes('god_spec_detection'))).toBe(true);
      expect(files.some(f => f.includes('requirements_completeness'))).toBe(true);

      const promptFile = await fs.readFile(path.join(result.promptsDir, files[0]), 'utf-8');
      expect(promptFile).toContain('--- INPUT ---');
      expect(promptFile).toContain('--- OUTPUT ---');
    });

    it('saveReviewLog_CreatesJsonSummary', async () => {
      // Arrange
      const logDir = path.join(testDir, '.speki', 'logs');
      const suggestions = [createMockSuggestion({ severity: 'critical', issue: 'Critical issue' })];
      const input = createMockInput({
        aggregatedResult: createMockAggregatedResult({
          verdict: 'NEEDS_IMPROVEMENT',
          suggestions,
        }),
      });

      // Act
      const result = await saveReviewLog(logDir, input);

      // Assert
      const jsonExists = await fs.stat(result.jsonFile).then(() => true).catch(() => false);
      expect(jsonExists).toBe(true);

      const jsonContent = JSON.parse(await fs.readFile(result.jsonFile, 'utf-8'));
      expect(jsonContent.verdict).toBe('NEEDS_IMPROVEMENT');
      expect(jsonContent.specPath).toBe('/test/specs/test-spec.md');
      expect(jsonContent.suggestions).toHaveLength(1);
      expect(jsonContent.suggestions[0].severity).toBe('critical');
      expect(jsonContent.suggestions[0].issue).toBe('Critical issue');
      expect(jsonContent.promptResults).toBeDefined();
      expect(jsonContent.timestamp).toBeDefined();
    });

    it('saveReviewLog_LogsOnFailure', async () => {
      // Arrange
      const logDir = path.join(testDir, '.speki', 'logs');
      const input = createMockInput({
        promptResults: [
          createMockPromptResult({
            promptName: 'requirements_completeness',
            verdict: 'FAIL',
            issues: ['Missing functional requirements', 'No acceptance criteria'],
          }),
        ],
        aggregatedResult: createMockAggregatedResult({
          verdict: 'FAIL',
          suggestions: [
            createMockSuggestion({ severity: 'critical', issue: 'Spec is incomplete' }),
          ],
        }),
      });

      // Act
      const result = await saveReviewLog(logDir, input);

      // Assert - All three files are created even on failure
      const logExists = await fs.stat(result.logFile).then(() => true).catch(() => false);
      const promptsDirExists = await fs.stat(result.promptsDir).then(s => s.isDirectory()).catch(() => false);
      const jsonExists = await fs.stat(result.jsonFile).then(() => true).catch(() => false);

      expect(logExists).toBe(true);
      expect(promptsDirExists).toBe(true);
      expect(jsonExists).toBe(true);

      // Check log file contains failure information
      const logContent = await fs.readFile(result.logFile, 'utf-8');
      expect(logContent).toContain('Overall Verdict: FAIL');
      expect(logContent).toContain('Missing functional requirements');

      // Check JSON contains failure information
      const jsonContent = JSON.parse(await fs.readFile(result.jsonFile, 'utf-8'));
      expect(jsonContent.verdict).toBe('FAIL');

      // Check prompts directory contains prompt with issues
      const files = await fs.readdir(result.promptsDir);
      const promptFile = await fs.readFile(path.join(result.promptsDir, files[0]), 'utf-8');
      expect(promptFile).toContain('Verdict: FAIL');
      expect(promptFile).toContain('Missing functional requirements');
    });
  });
});
