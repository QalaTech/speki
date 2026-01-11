import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import type { ChildProcess } from 'child_process';
import type { Project } from '../../project.js';
import type { ReviewFeedback } from '../../../types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path.includes('prd')) {
        return Promise.resolve('# Test PRD\n\nSome requirements');
      }
      if (path.includes('decompose') || path.includes('prompt')) {
        return Promise.resolve('You are a task decomposer. Output JSON.');
      }
      return Promise.resolve('');
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock stream-parser to capture callbacks and forward text
let capturedOnText: ((text: string) => void) | null = null;
vi.mock('../../claude/stream-parser.js', () => ({
  parseStream: vi.fn().mockImplementation((_stream, callbacks) => {
    capturedOnText = callbacks?.onText || null;
    return Promise.resolve();
  }),
  createConsoleCallbacks: vi.fn(() => ({
    onText: vi.fn(),
    onToolCall: vi.fn(),
  })),
}));

// Mock settings
vi.mock('../../settings.js', () => ({
  loadGlobalSettings: vi.fn().mockResolvedValue({
    reviewer: { cli: 'claude' },
  }),
}));

// Mock cli-path
vi.mock('../../cli-path.js', () => ({
  resolveCliPath: vi.fn().mockReturnValue('/usr/bin/claude'),
}));

// Mock runDecomposeReview
vi.mock('../../spec-review/runner.js', () => ({
  runDecomposeReview: vi.fn(),
}));

// Mock getReviewTimeout
vi.mock('../../spec-review/timeout.js', () => ({
  getReviewTimeout: vi.fn(() => 600_000),
}));

// Import the function under test after mocks are set up
import { runDecompose } from '../runner.js';
import { spawn } from 'child_process';
import { runDecomposeReview } from '../../spec-review/runner.js';
import { getReviewTimeout } from '../../spec-review/timeout.js';

function createMockChildProcess(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new EventEmitter() as unknown as Readable;
  child.stderr = new EventEmitter() as unknown as Readable;
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Writable;
  child.kill = vi.fn();
  return child;
}

function createMockProject(): Project {
  return {
    projectPath: '/test/project',
    ralphDir: '/test/project/.ralph',
    tasksDir: '/test/project/.ralph/tasks',
    logsDir: '/test/project/.ralph/logs',
    loadConfig: vi.fn().mockResolvedValue({}),
    loadDecomposeState: vi.fn().mockResolvedValue({}),
    saveDecomposeState: vi.fn().mockResolvedValue(undefined),
    decomposeStatePath: '/test/project/.ralph/decompose_state.json',
    loadPRD: vi.fn().mockResolvedValue(null),
    listTasks: vi.fn().mockResolvedValue([]),
    decomposePromptPath: '/test/project/.ralph/templates/decompose.md',
    promptPath: '/test/project/.ralph/templates/prompt.md',
  } as unknown as Project;
}

function createPassFeedback(): ReviewFeedback {
  return {
    verdict: 'PASS',
    missingRequirements: [],
    contradictions: [],
    dependencyErrors: [],
    duplicates: [],
    suggestions: [],
  };
}

function createFailFeedback(): ReviewFeedback {
  return {
    verdict: 'FAIL',
    missingRequirements: ['Missing requirement 1'],
    contradictions: [],
    dependencyErrors: [],
    duplicates: [],
    suggestions: [],
  };
}

const validPrdJson = JSON.stringify({
  projectName: 'Test Project',
  branchName: 'test-branch',
  language: 'nodejs',
  standardsFile: '.ralph/standards/nodejs.md',
  userStories: [
    { id: 'US-001', title: 'Test Story', priority: 1, passes: false },
  ],
});

describe('runDecompose with --review flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedOnText = null;

    // Default timeout
    vi.mocked(getReviewTimeout).mockReturnValue(600_000);

    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('decompose_WithReviewFlag_TriggersReview', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Start the promise but don't await yet
    const resultPromise = runDecompose(project, {
      prdFile: '/test/prd.md',
      enablePeerReview: true,
    });

    // Wait for parseStream to be called and capture the onText callback
    await vi.advanceTimersByTimeAsync(10);

    // Emit stdout data (parseStream is mocked, but onText callback was captured)
    if (capturedOnText) {
      capturedOnText(validPrdJson);
    }
    mockChild.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(runDecomposeReview).toHaveBeenCalled();
    expect(result.verdict).toBe('PASS');
  });

  it('decompose_WithReviewFail_RetriesRevision', async () => {
    // Arrange
    const project = createMockProject();

    // First review returns FAIL, second returns PASS
    vi.mocked(runDecomposeReview)
      .mockResolvedValueOnce(createFailFeedback())
      .mockResolvedValueOnce(createPassFeedback());

    // Track spawned processes
    let spawnCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      spawnCount++;
      const child = createMockChildProcess();

      // Schedule output for this child process after parseStream is hooked
      setTimeout(() => {
        if (capturedOnText) {
          capturedOnText(validPrdJson);
        }
        child.emit('close', 0);
      }, 10);

      return child;
    });

    // Start the promise
    const resultPromise = runDecompose(project, {
      prdFile: '/test/prd.md',
      enablePeerReview: true,
      maxReviewAttempts: 3,
    });

    // Advance timers to let all spawned processes complete
    await vi.advanceTimersByTimeAsync(100);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(runDecomposeReview).toHaveBeenCalledTimes(2);
    expect(result.verdict).toBe('PASS');
    // First spawn for decompose, second for revision after FAIL
    expect(spawnCount).toBeGreaterThanOrEqual(2);
  });

  it('decompose_WithReviewFlag_UsesConfiguredTimeout', async () => {
    // Arrange
    const project = createMockProject();
    const customTimeout = 120_000; // 2 minutes

    vi.mocked(getReviewTimeout).mockReturnValue(customTimeout);
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Start the promise
    const resultPromise = runDecompose(project, {
      prdFile: '/test/prd.md',
      enablePeerReview: true,
      reviewTimeoutMs: customTimeout,
    });

    // Simulate Claude completing
    await vi.advanceTimersByTimeAsync(10);
    if (capturedOnText) {
      capturedOnText(validPrdJson);
    }
    mockChild.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    // Act
    await resultPromise;

    // Assert
    expect(getReviewTimeout).toHaveBeenCalledWith(customTimeout);
    expect(runDecomposeReview).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        timeoutMs: customTimeout,
      })
    );
  });
});
