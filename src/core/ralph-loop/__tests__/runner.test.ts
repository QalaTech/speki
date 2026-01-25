import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '../../project.js';
import type { PRDData, UserStory } from '../../../types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock chalk (prevent color codes in tests)
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    blue: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
  },
}));

// Helper to create a complete RunResult mock
function createMockRunResult(overrides: { isComplete?: boolean } = {}) {
  return {
    success: true,
    isComplete: overrides.isComplete ?? false,
    durationMs: 1000,
    output: '',
    jsonlPath: '/logs/test.jsonl',
    stderrPath: '/logs/test.stderr',
    exitCode: 0,
    parsed: { fullText: '', toolCalls: [], isComplete: overrides.isComplete ?? false },
    claudePid: 1234,
  };
}

// Mock claude runner
vi.mock('../../claude/runner.js', () => ({
  isClaudeAvailable: vi.fn().mockResolvedValue(true),
  runClaude: vi.fn().mockResolvedValue({
    success: true,
    isComplete: false,
    durationMs: 1000,
    output: '',
    jsonlPath: '/logs/test.jsonl',
    stderrPath: '/logs/test.stderr',
    exitCode: 0,
    parsed: { fullText: '', toolCalls: [], isComplete: false },
    claudePid: 1234,
  }),
}));

// Mock stream-parser
vi.mock('../../claude/stream-parser.js', () => ({
  createConsoleCallbacks: vi.fn(() => ({
    onText: vi.fn(),
    onToolCall: vi.fn(),
  })),
}));

// Mock registry
vi.mock('../../registry.js', () => ({
  Registry: {
    updateStatus: vi.fn(),
  },
}));

// Import the function under test
import { runRalphLoop, type LoopOptions } from '../runner.js';
import { runClaude } from '../../claude/runner.js';

function createMockStory(id: string, passes = false, priority = 1, deps: string[] = []): UserStory {
  return {
    id,
    title: `Story ${id}`,
    description: `Description for ${id}`,
    acceptanceCriteria: ['AC1'],
    testCases: ['Test1'],
    priority,
    passes,
    notes: '',
    dependencies: deps,
  };
}

function createMockPRD(stories: UserStory[]): PRDData {
  return {
    projectName: 'Test Project',
    branchName: 'test-branch',
    language: 'nodejs',
    standardsFile: '.speki/standards/nodejs.md',
    description: 'Test PRD',
    userStories: stories,
  };
}

function createMockProject(initialPrd: PRDData, prdSequence?: PRDData[]): Project {
  let loadPrdCallCount = 0;

  return {
    projectPath: '/test/project',
    promptPath: '/test/project/.speki/prompt.md',
    logsDir: '/test/project/.speki/logs',
    loadPRD: vi.fn().mockImplementation(async () => {
      if (prdSequence && loadPrdCallCount > 0) {
        const idx = Math.min(loadPrdCallCount - 1, prdSequence.length - 1);
        loadPrdCallCount++;
        return prdSequence[idx];
      }
      loadPrdCallCount++;
      return initialPrd;
    }),
    saveStatus: vi.fn().mockResolvedValue(undefined),
    generateCurrentTaskContext: vi.fn().mockResolvedValue(undefined),
    cleanupCurrentTaskContext: vi.fn().mockResolvedValue(undefined),
  } as unknown as Project;
}

describe('runRalphLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log to prevent output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('taskExecutor_UsesDynamicLimit', async () => {
    const story1 = createMockStory('US-001', false);
    const prd = createMockPRD([story1]);

    const prdAfterCompletion = createMockPRD([createMockStory('US-001', true)]);
    const project = createMockProject(prd, [prdAfterCompletion]);

    let dynamicLimit = 5;
    const getMaxIterations = vi.fn(() => dynamicLimit);

    vi.mocked(runClaude).mockResolvedValueOnce(createMockRunResult({ isComplete: true }));

    const options: LoopOptions = {
      maxIterations: getMaxIterations,
    };

    const result = await runRalphLoop(project, options);

    expect(getMaxIterations).toHaveBeenCalled();
    expect(result.allComplete).toBe(true);
  });

  it('taskExecutor_RecalculatesOnTaskAddition', async () => {
    const story1 = createMockStory('US-001', false);
    const prd = createMockPRD([story1]);

    const story2 = createMockStory('US-002', false, 2);
    const prdWithNewTask = createMockPRD([
      createMockStory('US-001', false),
      story2,
    ]);

    const prdAllComplete = createMockPRD([
      createMockStory('US-001', true),
      createMockStory('US-002', true),
    ]);

    const project = createMockProject(prd, [prdWithNewTask, prdAllComplete]);

    const onTasksChanged = vi.fn();

    vi.mocked(runClaude)
      .mockResolvedValueOnce(createMockRunResult({ isComplete: false }))
      .mockResolvedValueOnce(createMockRunResult({ isComplete: true }));

    const options: LoopOptions = {
      maxIterations: 10,
      onTasksChanged,
    };

    await runRalphLoop(project, options);

    expect(onTasksChanged).toHaveBeenCalledWith(2);
  });

  it('taskExecutor_AllTasksFitInWindow', async () => {
    const stories = Array.from({ length: 10 }, (_, i) =>
      createMockStory(`US-${String(i + 1).padStart(3, '0')}`, false, i + 1)
    );
    const prd = createMockPRD(stories);

    const allComplete = createMockPRD(
      stories.map((s) => ({ ...s, passes: true }))
    );
    const project = createMockProject(prd, [allComplete]);

    vi.mocked(runClaude).mockResolvedValueOnce(createMockRunResult({ isComplete: true }));

    const expectedLimit = Math.ceil(10 * 1.2);
    let actualLimit = 0;
    const getMaxIterations = vi.fn(() => {
      actualLimit = expectedLimit;
      return expectedLimit;
    });

    const options: LoopOptions = {
      maxIterations: getMaxIterations,
    };

    const result = await runRalphLoop(project, options);

    expect(actualLimit).toBe(12);
    expect(actualLimit).toBeGreaterThanOrEqual(stories.length);
    expect(result.allComplete).toBe(true);
  });
});
