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

// Mock spec-metadata utilities
vi.mock('../../spec-review/spec-metadata.js', () => ({
  extractSpecId: vi.fn((path: string) => path.replace(/.*\//, '').replace(/\.md$/, '')),
  ensureSpecDir: vi.fn((projectPath: string, specId: string) =>
    Promise.resolve(`${projectPath}/.ralph/specs/${specId}`)
  ),
  getSpecLogsDir: vi.fn((projectPath: string, specId: string) =>
    `${projectPath}/.ralph/specs/${specId}/logs`
  ),
  readSpecMetadata: vi.fn().mockResolvedValue(null),
  initSpecMetadata: vi.fn().mockResolvedValue({
    created: '2026-01-13T12:00:00.000Z',
    lastModified: '2026-01-13T12:00:00.000Z',
    status: 'draft',
    specPath: '/test/prd.md',
  }),
  updateSpecStatus: vi.fn().mockResolvedValue(undefined),
}));

// Import the function under test after mocks are set up
import { runDecompose } from '../runner.js';
import { spawn } from 'child_process';
import { runDecomposeReview } from '../../spec-review/runner.js';
import { getReviewTimeout } from '../../spec-review/timeout.js';
import {
  extractSpecId,
  ensureSpecDir,
  getSpecLogsDir,
  readSpecMetadata,
  initSpecMetadata,
  updateSpecStatus,
} from '../../spec-review/spec-metadata.js';

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

// Helper: Setup test environment with common mocks
function setupTestEnvironment() {
  vi.clearAllMocks();
  vi.useFakeTimers();
  capturedOnText = null;
  vi.mocked(getReviewTimeout).mockReturnValue(600_000);

  // Suppress console output during tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
}

// Helper: Cleanup test environment
function cleanupTestEnvironment() {
  vi.restoreAllMocks();
  vi.useRealTimers();
}

// Helper: Simulate Claude completing successfully
async function simulateClaudeCompletion(mockChild: ChildProcess, jsonOutput = validPrdJson) {
  await vi.advanceTimersByTimeAsync(10);
  if (capturedOnText) {
    capturedOnText(jsonOutput);
  }
  mockChild.emit('close', 0);
  await vi.advanceTimersByTimeAsync(10);
}

describe('runDecompose with --review flag', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('decompose_WithReviewFlag_TriggersReview', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/prd.md',
      enablePeerReview: true,
    });

    await simulateClaudeCompletion(mockChild);
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

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/prd.md',
      enablePeerReview: true,
      reviewTimeoutMs: customTimeout,
    });

    await simulateClaudeCompletion(mockChild);
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

describe('runDecompose with spec-partitioned output', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('decompose_WithNewSpec_CreatesSpecDir', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/my-feature.md',
      enablePeerReview: false,
    });

    await simulateClaudeCompletion(mockChild);
    await resultPromise;

    // Assert
    expect(ensureSpecDir).toHaveBeenCalledWith('/test/project', 'my-feature');
  });

  it('decompose_WithNewSpec_WritesDecomposeStateToSpecDir', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/my-feature.md',
      enablePeerReview: false,
    });

    await simulateClaudeCompletion(mockChild);
    const result = await resultPromise;

    // Assert
    expect(result.outputPath).toBe('/test/project/.ralph/specs/my-feature/decompose_state.json');
  });

  it('decompose_WithNewSpec_InitializesMetadata', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(readSpecMetadata).mockResolvedValue(null);
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/my-feature.md',
      enablePeerReview: false,
    });

    await simulateClaudeCompletion(mockChild);
    await resultPromise;

    // Assert
    expect(initSpecMetadata).toHaveBeenCalledWith('/test/project', '/test/my-feature.md');
  });

  it('decompose_OnSuccess_TransitionsStatusToDecomposed', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/my-feature.md',
      enablePeerReview: false,
    });

    await simulateClaudeCompletion(mockChild);
    await resultPromise;

    // Assert
    expect(updateSpecStatus).toHaveBeenCalledWith('/test/project', 'my-feature', 'decomposed');
  });

  it('decompose_WritesLogToSpecLogsDir', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/my-feature.md',
      enablePeerReview: false,
    });

    await simulateClaudeCompletion(mockChild);
    await resultPromise;

    // Assert
    expect(getSpecLogsDir).toHaveBeenCalledWith('/test/project', 'my-feature');
  });
});
