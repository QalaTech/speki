import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

vi.mock('fs', () => ({
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

import { promises as fs } from 'fs';
import { gatherCodebaseContext } from '../codebase-context.js';
import { aggregateResults } from '../aggregator.js';
import { getReviewTimeout } from '../timeout.js';
import { runSpecReview, runDecomposeReview } from '../runner.js';
import type { CodebaseContext } from '../../../types/index.js';

function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Writable;
  proc.stdout = new EventEmitter() as unknown as Readable;
  proc.stderr = new EventEmitter() as unknown as Readable;
  proc.kill = vi.fn();
  return proc;
}

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

  let mockProcesses: ChildProcess[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockProcesses = [];

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();
      mockProcesses.push(proc);
      return proc;
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
      logPath: '/test/project/.ralph/logs/spec-review.json',
      durationMs: 1000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function simulateSequentialResponses(response: string = mockPromptResponse): Promise<void> {
    for (let i = 0; i < 5; i++) {
      while (mockProcesses.length <= i) {
        await vi.advanceTimersByTimeAsync(10);
      }

      const proc = mockProcesses[i];
      (proc.stdout as EventEmitter).emit('data', Buffer.from(response));
      (proc as unknown as EventEmitter).emit('close', 0);

      await vi.advanceTimersByTimeAsync(10);
    }
  }

  it('runSpecReview_WithValidSpec_ReturnsResult', async () => {
    // Arrange
    const resultPromise = runSpecReview(mockSpecPath, { cwd: '/test/project' });
    await simulateSequentialResponses();

    // Act
    const result = await resultPromise;

    // Assert
    expect(result).toBeDefined();
    expect(result.verdict).toBe('PASS');
    expect(result.codebaseContext).toEqual(mockCodebaseContext);
  });

  it('runSpecReview_LoadsGoldenStandard', async () => {
    // Arrange
    const resultPromise = runSpecReview(mockSpecPath, { cwd: '/test/project' });
    await simulateSequentialResponses();

    // Act
    await resultPromise;

    // Assert - verify golden standard was loaded from the correct path
    expect(fs.readFile).toHaveBeenCalledWith(
      '/test/project/.ralph/standards/golden_standard_prd_deterministic_decomposable.md',
      'utf-8'
    );
  });

  it('runSpecReview_SpawnsAgentWithTools', async () => {
    // Arrange
    const resultPromise = runSpecReview(mockSpecPath, { cwd: '/test/project' });
    await simulateSequentialResponses();

    // Act
    await resultPromise;

    // Assert - verify spawn was called WITHOUT --tools '' flag
    expect(spawn).toHaveBeenCalled();
    const spawnCalls = vi.mocked(spawn).mock.calls;

    // Check that --tools is NOT in the arguments (tools are enabled by default)
    for (const call of spawnCalls) {
      const args = call[1] as string[];
      expect(args).not.toContain('--tools');
    }

    // Verify correct base arguments are present
    const firstCall = spawnCalls[0];
    const firstArgs = firstCall[1] as string[];
    expect(firstArgs).toContain('--dangerously-skip-permissions');
    expect(firstArgs).toContain('--print');
    expect(firstArgs).toContain('--output-format');
    expect(firstArgs).toContain('text');
  });

  it('runSpecReview_RunsGodSpecFirst', async () => {
    // Arrange
    const promptsReceived: string[] = [];

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();
      mockProcesses.push(proc);

      // Capture the prompt sent to stdin
      const mockWrite = vi.fn((data: string) => {
        promptsReceived.push(data);
        return true;
      });
      if (proc.stdin) {
        (proc.stdin as Writable).write = mockWrite as typeof proc.stdin.write;
      }

      return proc;
    });

    const resultPromise = runSpecReview(mockSpecPath, { cwd: '/test/project' });
    await simulateSequentialResponses();

    // Act
    await resultPromise;

    // Assert - first prompt should be god spec detection
    expect(promptsReceived.length).toBe(5); // All 5 prompts
    expect(promptsReceived[0]).toContain('god spec');
  });

  it('runSpecReview_RespectsTimeout', async () => {
    // Arrange
    vi.mocked(getReviewTimeout).mockReturnValue(600000); // 10 minute total timeout

    const resultPromise = runSpecReview(mockSpecPath, { cwd: '/test/project' });
    await simulateSequentialResponses();

    // Act
    await resultPromise;

    // Assert - verify timeout was retrieved
    expect(getReviewTimeout).toHaveBeenCalled();
  });

  it('runSpecReview_AggregatesPromptResults', async () => {
    // Arrange
    const resultPromise = runSpecReview(mockSpecPath, { cwd: '/test/project' });
    await simulateSequentialResponses();

    // Act
    await resultPromise;

    // Assert - verify aggregator was called with results from all prompts
    expect(aggregateResults).toHaveBeenCalled();
    const aggregatorCall = vi.mocked(aggregateResults).mock.calls[0];
    const promptResults = aggregatorCall[0];

    // Should have 5 prompt results (god spec + 4 others)
    expect(promptResults).toHaveLength(5);

    // Verify prompt names are correct and in order
    expect(promptResults[0].promptName).toBe('god_spec_detection');
    expect(promptResults[1].promptName).toBe('requirements_completeness');
    expect(promptResults[2].promptName).toBe('clarity_specificity');
    expect(promptResults[3].promptName).toBe('testability');
    expect(promptResults[4].promptName).toBe('scope_validation');

    // Verify codebase context was passed
    const contextArg = aggregatorCall[1];
    expect(contextArg).toEqual(mockCodebaseContext);

    // Verify spec path was passed for split proposals
    const originalFileArg = aggregatorCall[3];
    expect(originalFileArg).toBe(mockSpecPath);
  });
});

describe('runDecomposeReview', () => {
  const mockSpecContent = '# Test Spec\n\n## Requirements\n\n- Feature A\n- Feature B';
  const mockTasksJson = JSON.stringify([
    { id: 'US-001', title: 'Implement Feature A', dependencies: [] },
    { id: 'US-002', title: 'Implement Feature B', dependencies: ['US-001'] },
  ]);

  const mockPromptResponse = `Here is my analysis:

\`\`\`json
{
  "verdict": "PASS",
  "issues": [],
  "suggestions": []
}
\`\`\`

That's my assessment.`;

  let mockProcesses: ChildProcess[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockProcesses = [];

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();
      mockProcesses.push(proc);
      return proc;
    });

    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function simulateDecomposeResponses(response: string = mockPromptResponse): Promise<void> {
    for (let i = 0; i < 4; i++) {
      while (mockProcesses.length <= i) {
        await vi.advanceTimersByTimeAsync(10);
      }

      const proc = mockProcesses[i];
      (proc.stdout as EventEmitter).emit('data', Buffer.from(response));
      (proc as unknown as EventEmitter).emit('close', 0);

      await vi.advanceTimersByTimeAsync(10);
    }
  }

  it('runDecomposeReview_WithValidTasks_ReturnsResult', async () => {
    // Arrange
    const resultPromise = runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });
    await simulateDecomposeResponses();

    // Act
    const result = await resultPromise;

    // Assert
    expect(result).toBeDefined();
    expect(result.verdict).toBe('PASS');
    expect(result.missingRequirements).toEqual([]);
    expect(result.contradictions).toEqual([]);
    expect(result.dependencyErrors).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it('runDecomposeReview_SpawnsAgentWithoutTools', async () => {
    // Arrange
    const resultPromise = runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });
    await simulateDecomposeResponses();

    // Act
    await resultPromise;

    // Assert - verify spawn was called WITH --tools '' flag
    expect(spawn).toHaveBeenCalled();
    const spawnCalls = vi.mocked(spawn).mock.calls;

    // All 4 decompose prompts should use --tools ''
    for (const call of spawnCalls) {
      const args = call[1] as string[];
      expect(args).toContain('--tools');
      const toolsIndex = args.indexOf('--tools');
      expect(args[toolsIndex + 1]).toBe('');
    }
  });

  it('runDecomposeReview_ChecksMissingRequirements', async () => {
    // Arrange
    const missingReqResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": ["Requirement R1 is not covered by any task"],
  "suggestions": []
}
\`\`\``;

    let promptIndex = 0;
    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();
      mockProcesses.push(proc);
      return proc;
    });

    const resultPromise = runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Send different responses for each prompt
    for (let i = 0; i < 4; i++) {
      while (mockProcesses.length <= i) {
        await vi.advanceTimersByTimeAsync(10);
      }
      const proc = mockProcesses[i];
      const response = i === 0 ? missingReqResponse : mockPromptResponse;
      (proc.stdout as EventEmitter).emit('data', Buffer.from(response));
      (proc as unknown as EventEmitter).emit('close', 0);
      await vi.advanceTimersByTimeAsync(10);
    }

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.missingRequirements).toContain('Requirement R1 is not covered by any task');
  });

  it('runDecomposeReview_ChecksContradictions', async () => {
    // Arrange
    const contradictionResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": ["Task US-001 contradicts spec requirement for Feature A"],
  "suggestions": []
}
\`\`\``;

    const resultPromise = runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Send contradiction response for second prompt (index 1)
    for (let i = 0; i < 4; i++) {
      while (mockProcesses.length <= i) {
        await vi.advanceTimersByTimeAsync(10);
      }
      const proc = mockProcesses[i];
      const response = i === 1 ? contradictionResponse : mockPromptResponse;
      (proc.stdout as EventEmitter).emit('data', Buffer.from(response));
      (proc as unknown as EventEmitter).emit('close', 0);
      await vi.advanceTimersByTimeAsync(10);
    }

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.contradictions).toContain('Task US-001 contradicts spec requirement for Feature A');
  });

  it('runDecomposeReview_ChecksDependencies', async () => {
    // Arrange
    const dependencyResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": ["Circular dependency detected: US-001 -> US-002 -> US-001"],
  "suggestions": []
}
\`\`\``;

    const resultPromise = runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Send dependency error response for third prompt (index 2)
    for (let i = 0; i < 4; i++) {
      while (mockProcesses.length <= i) {
        await vi.advanceTimersByTimeAsync(10);
      }
      const proc = mockProcesses[i];
      const response = i === 2 ? dependencyResponse : mockPromptResponse;
      (proc.stdout as EventEmitter).emit('data', Buffer.from(response));
      (proc as unknown as EventEmitter).emit('close', 0);
      await vi.advanceTimersByTimeAsync(10);
    }

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.dependencyErrors).toContain('Circular dependency detected: US-001 -> US-002 -> US-001');
  });

  it('runDecomposeReview_ChecksDuplicates', async () => {
    // Arrange
    const duplicateResponse = `Analysis:

\`\`\`json
{
  "verdict": "FAIL",
  "issues": ["Tasks US-001 and US-003 appear to be duplicates"],
  "suggestions": []
}
\`\`\``;

    const resultPromise = runDecomposeReview(mockSpecContent, mockTasksJson, { cwd: '/test/project' });

    // Send duplicate error response for fourth prompt (index 3)
    for (let i = 0; i < 4; i++) {
      while (mockProcesses.length <= i) {
        await vi.advanceTimersByTimeAsync(10);
      }
      const proc = mockProcesses[i];
      const response = i === 3 ? duplicateResponse : mockPromptResponse;
      (proc.stdout as EventEmitter).emit('data', Buffer.from(response));
      (proc as unknown as EventEmitter).emit('close', 0);
      await vi.advanceTimersByTimeAsync(10);
    }

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.verdict).toBe('FAIL');
    expect(result.duplicates).toContain('Tasks US-001 and US-003 appear to be duplicates');
  });
});
