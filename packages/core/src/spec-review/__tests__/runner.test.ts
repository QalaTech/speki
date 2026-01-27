import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock is hoisted
const { mockRunStream, mockSelectEngine, mockWriteStream } = vi.hoisted(() => ({
  mockRunStream: vi.fn(),
  mockSelectEngine: vi.fn(),
  mockWriteStream: {
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  },
}));

// Mock engine factory - this is what the runner uses now
vi.mock('../../llm/engine-factory.js', () => ({
  selectEngine: mockSelectEngine,
}));

vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => mockWriteStream),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('../../cli-path.js', () => ({ resolveCliPath: vi.fn(() => 'claude') }));
vi.mock('../codebase-context.js', () => ({ gatherCodebaseContext: vi.fn() }));
vi.mock('../aggregator.js', () => ({ aggregateResults: vi.fn() }));
vi.mock('../timeout.js', () => ({ getReviewTimeout: vi.fn(() => 600000) }));
vi.mock('../review-logger.js', () => ({
  saveReviewLog: vi.fn(() => Promise.resolve({
    logFile: '/test/project/.speki/logs/spec_review_test.log',
    promptsDir: '/test/project/.speki/logs/spec_review_test.prompts',
    jsonFile: '/test/project/.speki/logs/spec_review_test.json',
  })),
}));

import { promises as fs } from 'fs';
import { selectEngine } from '../../llm/engine-factory.js';
import { gatherCodebaseContext } from '../codebase-context.js';
import { aggregateResults } from '../aggregator.js';
import { getReviewTimeout } from '../timeout.js';
import { runSpecReview, runDecomposeReview } from '../runner.js';
import type { CodebaseContext } from '../../types/index.js';

describe('runSpecReview', () => {
  const mockSpecPath = '/test/project/spec.md';
  const mockSpecContent = '# Test Spec\n\n## Requirements\n\n- Feature A\n- Feature B';
  const mockGoldenStandard = '# Golden Standard\n\nThis is the golden standard.';
  const mockCodebaseContext: CodebaseContext = {
    projectType: 'typescript',
    existingPatterns: ['ESM modules', 'Vitest tests'],
    relevantFiles: ['src/', 'tests/'],
  };
  const mockPromptResponse = `Here is my analysis:

\`\`\`json
{
  "verdict": "PASS",
  "issues": [],
  "suggestions": []
}
\`\`\`

That's my assessment.`;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mockSelectEngine to return an engine with mockRunStream
    mockSelectEngine.mockResolvedValue({
      engine: { runStream: mockRunStream },
      model: 'test-model',
    });

    // Set up mockRunStream to return successful results for each prompt
    mockRunStream.mockResolvedValue({
      output: mockPromptResponse,
      isComplete: true,
      durationMs: 100,
    });

    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      if (typeof path === 'string' && path.includes('spec.md')) {
        return mockSpecContent;
      }
      if (typeof path === 'string' && path.includes('golden_standard')) {
        return mockGoldenStandard;
      }
      throw new Error('File not found');
    });
    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);

    vi.mocked(gatherCodebaseContext).mockResolvedValue(mockCodebaseContext);
    vi.mocked(aggregateResults).mockReturnValue({
      verdict: 'PASS',
      categories: {},
      codebaseContext: mockCodebaseContext,
      suggestions: [],
      logPath: '/test/project/.speki/logs/spec-review.json',
      durationMs: 1000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runSpecReview_WithValidSpec_ReturnsResult', async () => {
    // Act
    const result = await runSpecReview(mockSpecPath, { cwd: '/test/project' });

    // Assert
    expect(result).toBeDefined();
    expect(result.verdict).toBe('PASS');
    expect(result.codebaseContext).toEqual(mockCodebaseContext);
  });

  it('runSpecReview_LoadsGoldenStandard', async () => {
    // Act
    await runSpecReview(mockSpecPath, { cwd: '/test/project' });

    // Assert - verify golden standard was loaded from the correct path
    expect(fs.readFile).toHaveBeenCalledWith(
      '/test/project/.speki/standards/golden_standard_prd_deterministic_decomposable.md',
      'utf-8'
    );
  });

  it('runSpecReview_UsesEngineRunStream', async () => {
    // Act
    await runSpecReview(mockSpecPath, { cwd: '/test/project' });

    // Assert - verify engine was used
    expect(selectEngine).toHaveBeenCalled();
    expect(mockRunStream).toHaveBeenCalled();
  });

  it('runSpecReview_RunsMultiplePrompts', async () => {
    // Act
    await runSpecReview(mockSpecPath, { cwd: '/test/project' });

    // Assert - verify engine was called multiple times
    // 7 PRD prompts + 1 aggregation agent = 8 calls
    expect(mockRunStream).toHaveBeenCalled();
    const runStreamCalls = mockRunStream.mock.calls;
    expect(runStreamCalls.length).toBe(8);
  });

  it('runSpecReview_RespectsTimeout', async () => {
    // Arrange
    vi.mocked(getReviewTimeout).mockReturnValue(600000); // 10 minute total timeout

    // Act
    await runSpecReview(mockSpecPath, { cwd: '/test/project' });

    // Assert - verify timeout was retrieved
    expect(getReviewTimeout).toHaveBeenCalled();
  });

  it('runSpecReview_ReturnsAggregatedResult', async () => {
    // Act
    const result = await runSpecReview(mockSpecPath, { cwd: '/test/project' });

    // Assert - verify result contains expected fields from aggregation
    expect(result.verdict).toBe('PASS');
    expect(result.codebaseContext).toEqual(mockCodebaseContext);
    expect(result.logPath).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('runDecomposeReview', () => {
  const mockSpecContent = '# Test Spec\n\n## Requirements\n\n- Feature A\n- Feature B';
  const mockTasksJson = JSON.stringify([
    { id: 'US-001', title: 'Implement Feature A', dependencies: [] },
    { id: 'US-002', title: 'Implement Feature B', dependencies: ['US-001'] },
  ]);

  const mockDecomposeResponse = `Here is my analysis:

\`\`\`json
{
  "verdict": "PASS",
  "issues": [],
  "suggestions": []
}
\`\`\`

That's my assessment.`;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mockSelectEngine to return an engine with mockRunStream
    mockSelectEngine.mockResolvedValue({
      engine: { runStream: mockRunStream },
      model: 'test-model',
    });

    // Set up mockRunStream to return successful results
    mockRunStream.mockResolvedValue({
      output: mockDecomposeResponse,
      isComplete: true,
      durationMs: 100,
    });

    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runDecomposeReview_WithValidTasks_ReturnsResult', async () => {
    // Act
    const result = await runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Assert
    expect(result).toBeDefined();
    expect(result.verdict).toBe('PASS');
    expect(result.missingRequirements).toEqual([]);
    expect(result.contradictions).toEqual([]);
    expect(result.dependencyErrors).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it('runDecomposeReview_SpawnsAgentWithoutTools', async () => {
    // Act
    await runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Assert - verify engine was used with tools disabled
    expect(selectEngine).toHaveBeenCalled();
    expect(mockRunStream).toHaveBeenCalled();

    // All 4 decompose prompts should have been called
    expect(mockRunStream).toHaveBeenCalledTimes(4);
  });

  it('runDecomposeReview_ChecksMissingRequirements', async () => {
    // Arrange - first prompt returns a missing requirements error with critical severity
    const missingReqResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": [{"id": "missing-1", "severity": "critical", "description": "Requirement R1 is not covered by any task"}],
  "suggestions": []
}
\`\`\``;

    mockRunStream
      .mockResolvedValueOnce({ output: missingReqResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValue({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 });

    // Act
    const result = await runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'critical', description: 'Requirement R1 is not covered by any task' })])
    );
  });

  it('runDecomposeReview_ChecksContradictions', async () => {
    // Arrange - second prompt returns a contradiction error with critical severity
    const contradictionResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": [{"id": "contra-1", "severity": "critical", "description": "Task US-001 contradicts spec requirement for Feature A"}],
  "suggestions": []
}
\`\`\``;

    mockRunStream
      .mockResolvedValueOnce({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValueOnce({ output: contradictionResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValue({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 });

    // Act
    const result = await runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.contradictions).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'critical', description: 'Task US-001 contradicts spec requirement for Feature A' })])
    );
  });

  it('runDecomposeReview_ChecksDependencies', async () => {
    // Arrange - third prompt returns a dependency error with critical severity
    const dependencyResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": [{"id": "dep-1", "severity": "critical", "description": "Circular dependency detected: US-001 -> US-002 -> US-001"}],
  "suggestions": []
}
\`\`\``;

    mockRunStream
      .mockResolvedValueOnce({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValueOnce({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValueOnce({ output: dependencyResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValue({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 });

    // Act
    const result = await runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.dependencyErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'critical', description: 'Circular dependency detected: US-001 -> US-002 -> US-001' })])
    );
  });

  it('runDecomposeReview_ChecksDuplicates', async () => {
    // Arrange - fourth prompt returns a duplicate error with critical severity
    const duplicateResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": [{"id": "dup-1", "severity": "critical", "description": "Tasks US-001 and US-003 appear to be duplicates"}],
  "suggestions": []
}
\`\`\``;

    mockRunStream
      .mockResolvedValueOnce({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValueOnce({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValueOnce({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValueOnce({ output: duplicateResponse, isComplete: true, durationMs: 100 });

    // Act
    const result = await runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.duplicates).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'critical', description: 'Tasks US-001 and US-003 appear to be duplicates' })])
    );
  });

  it('runDecomposeReview_WarningOnlyIssues_ResultsInPass', async () => {
    // Arrange - prompt returns warning-only issues (no critical) — should PASS
    const warningOnlyResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": [{"id": "warn-1", "severity": "warning", "description": "Secondary requirement not fully covered"}],
  "suggestions": []
}
\`\`\``;

    mockRunStream
      .mockResolvedValueOnce({ output: warningOnlyResponse, isComplete: true, durationMs: 100 })
      .mockResolvedValue({ output: mockDecomposeResponse, isComplete: true, durationMs: 100 });

    // Act
    const result = await runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Assert - verdict should be PASS because no critical issues
    expect(result.verdict).toBe('PASS');
    expect(result.missingRequirements.length).toBe(1);
    expect(result.missingRequirements[0].severity).toBe('warning');
  });
});
