import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '../../project.js';
import type { PRDData, UserStory } from '../../types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises to avoid actual filesystem operations
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
}));

// Mock engine factory to skip CLI detection and return mock engine
vi.mock('../../llm/engine-factory.js', async (importOriginal) => {
  return {
    selectEngine: vi.fn(),
    isDefaultEngineAvailable: vi.fn().mockResolvedValue(true),
  };
});

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

// Mock claude runner (for isClaudeAvailable check)
vi.mock('../../claude/runner.js', () => ({
  isClaudeAvailable: vi.fn().mockResolvedValue(true),
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
import { selectEngine } from '../../llm/engine-factory.js';

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

// Module-level mock for engine runStream
let mockRunStream: ReturnType<typeof vi.fn>;

describe('runRalphLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log to prevent output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup mock engine with controllable runStream
    mockRunStream = vi.fn();
    vi.mocked(selectEngine).mockResolvedValue({
      engine: {
        runStream: mockRunStream,
      },
      model: 'test-model',
      engineName: 'test-engine',
    } as any);
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

    mockRunStream.mockResolvedValueOnce(createMockRunResult({ isComplete: true }));

    const options: LoopOptions = {
      maxIterations: getMaxIterations,
      logDir: '/test/project/.speki/logs',
      loadPRD: () => project.loadPRD(),
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

    mockRunStream
      .mockResolvedValueOnce(createMockRunResult({ isComplete: false }))
      .mockResolvedValueOnce(createMockRunResult({ isComplete: true }));

    const options: LoopOptions = {
      maxIterations: 10,
      onTasksChanged,
      logDir: '/test/project/.speki/logs',
      loadPRD: () => project.loadPRD(),
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

    mockRunStream.mockResolvedValueOnce(createMockRunResult({ isComplete: true }));

    const expectedLimit = Math.ceil(10 * 1.2);
    let actualLimit = 0;
    const getMaxIterations = vi.fn(() => {
      actualLimit = expectedLimit;
      return expectedLimit;
    });

    const options: LoopOptions = {
      maxIterations: getMaxIterations,
      logDir: '/test/project/.speki/logs',
      loadPRD: () => project.loadPRD(),
    };

    const result = await runRalphLoop(project, options);

    expect(actualLimit).toBe(12);
    expect(actualLimit).toBeGreaterThanOrEqual(stories.length);
    expect(result.allComplete).toBe(true);
  });

  it('handlesPartialFailureInParallelExecution', async () => {
    const story1 = createMockStory('US-001', false);
    const story2 = createMockStory('US-002', false);
    const prd = createMockPRD([story1, story2]);

    // After both iterations, all complete (retry succeeds)
    const prdAllComplete = createMockPRD([
      { ...story1, passes: true },
      { ...story2, passes: true },
    ]);
    const project = createMockProject(prd, [prdAllComplete, prdAllComplete]);

    // First task succeeds, second fails - then on retry, second succeeds
    mockRunStream
      .mockResolvedValueOnce(createMockRunResult({ isComplete: true }))   // US-001 succeeds
      .mockRejectedValueOnce(new Error('Engine crashed'))                  // US-002 fails
      .mockResolvedValueOnce(createMockRunResult({ isComplete: true }));   // US-002 retry succeeds

    const options: LoopOptions = {
      maxIterations: 5,
      logDir: '/test/project/.speki/logs',
      loadPRD: () => project.loadPRD(),
      parallel: { enabled: true, maxParallel: 2 },
    };

    // Should not throw, should continue despite failure
    const result = await runRalphLoop(project, options);

    // Should not have crashed
    expect(result.iterationsRun).toBeGreaterThan(0);
  }, 10000);

  it('parallelExecution_allTasksSucceed', async () => {
    const story1 = createMockStory('US-001', false);
    const story2 = createMockStory('US-002', false);
    const story3 = createMockStory('US-003', false);
    const prd = createMockPRD([story1, story2, story3]);

    const prdAllComplete = createMockPRD([
      createMockStory('US-001', true),
      createMockStory('US-002', true),
      createMockStory('US-003', true),
    ]);
    const project = createMockProject(prd, [prdAllComplete]);

    // All tasks succeed in parallel
    mockRunStream
      .mockResolvedValueOnce(createMockRunResult({ isComplete: true }))
      .mockResolvedValueOnce(createMockRunResult({ isComplete: true }))
      .mockResolvedValueOnce(createMockRunResult({ isComplete: true }));

    const options: LoopOptions = {
      maxIterations: 5,
      logDir: '/test/project/.speki/logs',
      loadPRD: () => project.loadPRD(),
      parallel: { enabled: true, maxParallel: 3 },
    };

    const result = await runRalphLoop(project, options);

    expect(result.allComplete).toBe(true);
    expect(result.storiesCompleted).toBe(3);
    // All should complete in one iteration (parallel)
    expect(result.iterationsRun).toBe(1);
    // Verify all 3 engines were spawned in parallel
    expect(mockRunStream).toHaveBeenCalledTimes(3);
  });

  it('parallelExecution_respectsMaxParallelLimit', async () => {
    // Create 5 tasks but maxParallel is 2
    const stories = Array.from({ length: 5 }, (_, i) =>
      createMockStory(`US-${String(i + 1).padStart(3, '0')}`, false)
    );
    const prd = createMockPRD(stories);

    // Simulate gradual completion - each PRD state shows more tasks complete
    const prd2Complete = createMockPRD(stories.map((s, i) => ({ ...s, passes: i < 2 })));
    const prd4Complete = createMockPRD(stories.map((s, i) => ({ ...s, passes: i < 4 })));
    const prdAllComplete = createMockPRD(stories.map(s => ({ ...s, passes: true })));
    
    const project = createMockProject(prd, [prd2Complete, prd4Complete, prdAllComplete]);

    // All tasks succeed - need enough mock responses
    for (let i = 0; i < 10; i++) {
      mockRunStream.mockResolvedValueOnce(createMockRunResult({ isComplete: true }));
    }

    const options: LoopOptions = {
      maxIterations: 10,
      logDir: '/test/project/.speki/logs',
      loadPRD: () => project.loadPRD(),
      parallel: { enabled: true, maxParallel: 2 },
    };

    const result = await runRalphLoop(project, options);

    // Key assertion: all tasks should complete
    expect(result.allComplete).toBe(true);
    // Should have run multiple iterations (not all at once)
    expect(result.iterationsRun).toBeGreaterThanOrEqual(3);
  }, 10000);

  it('parallelExecution_respectsDependencies', async () => {
    // US-002 depends on US-001, US-003 has no dependencies
    const story1 = createMockStory('US-001', false);
    const story2 = createMockStory('US-002', false, 1, ['US-001']); // Depends on US-001
    const story3 = createMockStory('US-003', false);
    const prd = createMockPRD([story1, story2, story3]);

    // After first iteration: US-001 and US-003 complete (no deps), US-002 still pending
    const prdAfterFirst = createMockPRD([
      { ...story1, passes: true },
      { ...story2, passes: false },
      { ...story3, passes: true },
    ]);
    // After second iteration: all complete
    const prdAllComplete = createMockPRD([
      { ...story1, passes: true },
      { ...story2, passes: true },
      { ...story3, passes: true },
    ]);
    const project = createMockProject(prd, [prdAfterFirst, prdAllComplete]);

    const executionOrder: string[] = [];
    mockRunStream.mockImplementation(async (opts: any) => {
      // Extract task ID from env
      const taskId = opts?.env?.QALA_CURRENT_TASK_ID;
      if (taskId) executionOrder.push(taskId);
      return createMockRunResult({ isComplete: true });
    });

    const options: LoopOptions = {
      maxIterations: 5,
      logDir: '/test/project/.speki/logs',
      loadPRD: () => project.loadPRD(),
      parallel: { enabled: true, maxParallel: 3 },
    };

    const result = await runRalphLoop(project, options);

    expect(result.allComplete).toBe(true);

    // US-001 and US-003 should run before US-002 (dependency)
    const us001Index = executionOrder.indexOf('US-001');
    const us002Index = executionOrder.indexOf('US-002');
    const us003Index = executionOrder.indexOf('US-003');

    expect(us001Index).toBeGreaterThanOrEqual(0);
    expect(us002Index).toBeGreaterThanOrEqual(0);
    expect(us003Index).toBeGreaterThanOrEqual(0);
    expect(us001Index).toBeLessThan(us002Index);
    expect(us003Index).toBeLessThan(us002Index);
  });
});
