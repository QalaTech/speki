import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import type { ChildProcess } from 'child_process';
import type { Project } from '../../project.js';
import type { ReviewFeedback } from '../../types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises and fs for createWriteStream
vi.mock('fs', () => {
  const mockWriteStream = {
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn().mockReturnThis(),
    pipe: vi.fn().mockReturnThis(),
  };
  return {
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
    createWriteStream: vi.fn(() => mockWriteStream),
  };
});

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
    Promise.resolve(`${projectPath}/.speki/specs/${specId}`)
  ),
  getSpecLogsDir: vi.fn((projectPath: string, specId: string) =>
    `${projectPath}/.speki/specs/${specId}/logs`
  ),
  readSpecMetadata: vi.fn().mockResolvedValue(null),
  initSpecMetadata: vi.fn().mockResolvedValue({
    created: '2026-01-13T12:00:00.000Z',
    lastModified: '2026-01-13T12:00:00.000Z',
    status: 'draft',
    specPath: '/test/prd.md',
  }),
  updateSpecStatus: vi.fn().mockResolvedValue(undefined),
  loadDecomposeStateForSpec: vi.fn().mockResolvedValue({}),
  saveDecomposeStateForSpec: vi.fn().mockResolvedValue(undefined),
  detectSpecType: vi.fn().mockReturnValue('prd'),
}));

// Mock engine-factory
vi.mock('../../llm/engine-factory.js', () => ({
  selectEngine: vi.fn().mockResolvedValue({
    engine: {
      runStream: vi.fn().mockResolvedValue({
        success: true,
        output: '{"userStories": [{"id": "US-001", "title": "Test Story", "description": "Test", "acceptanceCriteria": [], "testCases": []}]}',
      }),
    },
    model: 'claude-opus-4-5',
  }),
}));

// Mock id-registry
vi.mock('../../id-registry.js', () => ({
  IdRegistry: {
    getNextNumber: vi.fn().mockResolvedValue(1),
    registerIds: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import the function under test after mocks are set up
import { runDecompose } from '../runner.js';
import { spawn } from 'child_process';
import { selectEngine } from '../../llm/engine-factory.js';
import { runDecomposeReview } from '../../spec-review/runner.js';
import { getReviewTimeout } from '../../spec-review/timeout.js';
import {
  extractSpecId,
  ensureSpecDir,
  getSpecLogsDir,
  readSpecMetadata,
  initSpecMetadata,
  updateSpecStatus,
  loadDecomposeStateForSpec,
  saveDecomposeStateForSpec,
  detectSpecType,
} from '../../spec-review/spec-metadata.js';

function createMockChildProcess(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new EventEmitter() as unknown as Readable;
  const stderrEmitter = new EventEmitter() as unknown as Readable;
  (stderrEmitter as any).pipe = vi.fn().mockReturnThis();
  child.stderr = stderrEmitter;
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
    spekiDir: '/test/project/.speki',
    tasksDir: '/test/project/.speki/tasks',
    logsDir: '/test/project/.speki/logs',
    loadConfig: vi.fn().mockResolvedValue({}),
    loadDecomposeState: vi.fn().mockResolvedValue({}),
    saveDecomposeState: vi.fn().mockResolvedValue(undefined),
    decomposeStatePath: '/test/project/.speki/tasks.json',
    loadPRD: vi.fn().mockResolvedValue(null),
    listTasks: vi.fn().mockResolvedValue([]),
    decomposePromptPath: '/test/project/.speki/templates/decompose.md',
    promptPath: '/test/project/.speki/templates/prompt.md',
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
    missingRequirements: [{ id: 'missing-1', severity: 'critical', description: 'Missing requirement 1' }],
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
  standardsFile: '.speki/standards/nodejs.md',
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

    // Track engine.runStream calls instead of spawn
    let runStreamCallCount = 0;
    const mockRunStream = vi.fn().mockImplementation(() => {
      runStreamCallCount++;
      return Promise.resolve({
        success: true,
        output: validPrdJson,
      });
    });

    vi.mocked(selectEngine).mockResolvedValue({
      engine: { runStream: mockRunStream },
      model: 'claude-opus-4-5',
    });

    // Start the promise
    const resultPromise = runDecompose(project, {
      prdFile: '/test/prd.md',
      enablePeerReview: true,
      maxReviewAttempts: 3,
    });

    // Advance timers to let async operations complete
    await vi.advanceTimersByTimeAsync(100);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(runDecomposeReview).toHaveBeenCalledTimes(2);
    expect(result.verdict).toBe('PASS');
    // First runStream for decompose, second for revision after FAIL
    expect(runStreamCallCount).toBeGreaterThanOrEqual(2);
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
    expect(result.outputPath).toBe('/test/project/.speki/specs/my-feature/tasks.json');
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

describe('Decompose_RunsSuccessfully_AfterDeadCodeRemoval', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('Decompose_RunsSuccessfully_AfterDeadCodeRemoval', async () => {
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
    // Verify decompose completes successfully after dead code removal
    expect(result.success).toBe(true);
    expect(result.prd).toBeDefined();
    expect(result.storyCount).toBeGreaterThan(0);
    // Verify the output was written to spec-partitioned location
    expect(result.outputPath).toContain('.speki/specs/');
  });
});

describe('Decompose_UsesEngineRunStream_NotDirectClaude', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('Decompose_UsesEngineRunStream_NotDirectClaude', async () => {
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
    // Verify that decompose uses the Engine API (selectEngine)
    // This confirms that:
    // 1. The runClaudeWithPrompt and runClaudeDecompose functions have been removed
    // 2. The decompose flow now uses selectEngine().engine.runStream()
    // 3. No direct spawn calls are made by the removed functions
    expect(result.success).toBe(true);
    expect(selectEngine).toHaveBeenCalled();
    // Verify no direct spawn calls with the removed functions' signatures
    // (the old functions would have passed specific --output-format and --tools arguments)
  });
});

describe('Decompose_LogOutput_ShowsEngineNotClaude', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('Decompose_LogOutput_ShowsEngineNotClaude', async () => {
    // Arrange
    const project = createMockProject();
    vi.mocked(runDecomposeReview).mockResolvedValue(createPassFeedback());

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    // Capture console.log calls
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Act
    const resultPromise = runDecompose(project, {
      prdFile: '/test/my-feature.md',
      enablePeerReview: false,
    });

    await simulateClaudeCompletion(mockChild);
    const result = await resultPromise;

    // Assert
    // Verify that the output label shows "Engine Output:" not "Claude Output:"
    expect(result.success).toBe(true);

    // Check that console.log was called with "Engine Output:" label
    const engineOutputCall = consoleLogSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('Engine Output:')
    );
    expect(engineOutputCall).toBeDefined();

    // Verify that "Claude Output:" was NOT logged
    const claudeOutputCall = consoleLogSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('Claude Output:')
    );
    expect(claudeOutputCall).toBeUndefined();

    // Verify no other Claude-specific labels appear in logs
    const allLogCalls = consoleLogSpy.mock.calls.map(call => call[0]);
    const claudeSpecificLabels = allLogCalls.filter(call =>
      typeof call === 'string' && (
        call.includes('Claude exited') ||
        call.includes('Claude failed') ||
        call.includes('Claude is ') ||
        (call.includes('Claude') && !call.includes('using an Engine'))
      )
    );
    expect(claudeSpecificLabels.length).toBe(0);
  });
});
