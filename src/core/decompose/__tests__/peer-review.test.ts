import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { promises as fs } from 'fs';
import {
  runWithClaude,
  runPeerReview,
  CLAUDE_TIMEOUT_MS,
  CODEX_TIMEOUT_MS,
  type PeerReviewOptions,
} from '../peer-review.js';
import type { Project } from '../../project.js';
import type { PRDData } from '../../../types/index.js';

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock settings module
vi.mock('../../settings.js', () => ({
  loadGlobalSettings: vi.fn(),
}));

// Mock cli-detect module
vi.mock('../../cli-detect.js', () => ({
  detectCli: vi.fn(),
}));

// Import mocked modules for assertions
import { loadGlobalSettings } from '../../settings.js';
import { detectCli } from '../../cli-detect.js';

// Helper to create a mock child process with stdin
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

// Helper for valid ReviewFeedback JSON
function createValidFeedbackJson(verdict: 'PASS' | 'FAIL' = 'PASS'): string {
  return JSON.stringify({
    verdict,
    missingRequirements: [],
    contradictions: [],
    dependencyErrors: [],
    duplicates: [],
    suggestions: [],
  });
}

describe('runWithClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('runWithClaude_WithValidPrompt_ShouldReturnResponse', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const prompt = 'Review this PRD';
    const outputPath = '/tmp/output.raw';
    const validJson = createValidFeedbackJson();

    const resultPromise = runWithClaude({ prompt, outputPath });

    // Simulate successful response
    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from(validJson));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(result.feedback.verdict).toBe('PASS');
    expect(mockChild.stdin!.write).toHaveBeenCalledWith(prompt);
    expect(mockChild.stdin!.end).toHaveBeenCalled();
  });

  it('runWithClaude_WithExitCodeZero_ShouldSucceed', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const validJson = createValidFeedbackJson('FAIL');
    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    // Simulate exit code 0
    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from(validJson));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(result.feedback.verdict).toBe('FAIL');
  });

  it('runWithClaude_WithNonZeroExit_ShouldThrowWithStderr', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const stderrMessage = 'Claude CLI crashed';
    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    // Simulate stderr then non-zero exit
    setTimeout(() => {
      mockChild.stderr!.emit('data', Buffer.from(stderrMessage));
      mockChild.emit('close', 1);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act & Assert
    await expect(resultPromise).rejects.toThrow('Claude CLI exited with code 1');
    await expect(resultPromise).rejects.toThrow(stderrMessage);
  });

  it('runWithClaude_ShouldWriteRawOutputToFile', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const outputPath = '/tmp/test-output.raw';
    const validJson = createValidFeedbackJson();

    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath,
    });

    // Simulate successful response
    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from(validJson));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act
    await resultPromise;

    // Assert
    expect(fs.writeFile).toHaveBeenCalledWith(outputPath, validJson);
  });

  it('runWithClaude_WithTimeout_ShouldFailAfter5Minutes', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    // Advance time past the timeout without any response
    vi.advanceTimersByTime(CLAUDE_TIMEOUT_MS + 1);

    // Need to emit close after kill
    setTimeout(() => {
      mockChild.emit('close', null);
    }, 0);
    vi.advanceTimersByTime(1);

    // Act & Assert
    await expect(resultPromise).rejects.toThrow('timed out');
    await expect(resultPromise).rejects.toThrow('300 seconds');
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('runWithClaude_Response_ShouldMatchReviewFeedbackSchema', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const feedbackWithData = JSON.stringify({
      verdict: 'FAIL',
      missingRequirements: ['Requirement 1', 'Requirement 2'],
      contradictions: ['Task US-001 contradicts section 2'],
      dependencyErrors: ['US-003 depends on non-existent US-999'],
      duplicates: ['US-001 and US-002 overlap'],
      suggestions: ['Split US-001 into smaller tasks'],
    });

    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from(feedbackWithData));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act
    const result = await resultPromise;

    // Assert - verify the schema structure
    expect(result.feedback).toMatchObject({
      verdict: 'FAIL',
      missingRequirements: expect.arrayContaining(['Requirement 1', 'Requirement 2']),
      contradictions: expect.arrayContaining(['Task US-001 contradicts section 2']),
      dependencyErrors: expect.arrayContaining(['US-003 depends on non-existent US-999']),
      duplicates: expect.arrayContaining(['US-001 and US-002 overlap']),
      suggestions: expect.arrayContaining(['Split US-001 into smaller tasks']),
    });

    // Verify all fields are arrays
    expect(Array.isArray(result.feedback.missingRequirements)).toBe(true);
    expect(Array.isArray(result.feedback.contradictions)).toBe(true);
    expect(Array.isArray(result.feedback.dependencyErrors)).toBe(true);
    expect(Array.isArray(result.feedback.duplicates)).toBe(true);
    expect(Array.isArray(result.feedback.suggestions)).toBe(true);
  });

  it('should spawn claude with correct arguments', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const resultPromise = runWithClaude({
      prompt: 'test prompt',
      outputPath: '/tmp/output.raw',
    });

    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from(createValidFeedbackJson()));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    await resultPromise;

    // Assert
    expect(spawn).toHaveBeenCalledWith('claude', ['--print', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  it('should handle spawn error', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    // Simulate spawn error
    setTimeout(() => {
      mockChild.emit('error', new Error('spawn ENOENT'));
    }, 100);

    vi.advanceTimersByTime(100);

    // Act & Assert
    await expect(resultPromise).rejects.toThrow('Failed to spawn Claude CLI');
  });

  it('should reject when response is not valid JSON', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    // Simulate invalid response
    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from('This is not JSON'));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act & Assert
    await expect(resultPromise).rejects.toThrow('Failed to parse Claude response');
  });

  it('should handle JSON embedded in markdown code block', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const responseWithCodeBlock = '```json\n' + createValidFeedbackJson() + '\n```';

    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from(responseWithCodeBlock));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(result.feedback.verdict).toBe('PASS');
  });

  it('should reject when verdict is invalid', async () => {
    // Arrange
    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const invalidFeedback = JSON.stringify({
      verdict: 'UNKNOWN', // Invalid - must be PASS or FAIL
      missingRequirements: [],
    });

    const resultPromise = runWithClaude({
      prompt: 'test',
      outputPath: '/tmp/output.raw',
    });

    setTimeout(() => {
      mockChild.stdout!.emit('data', Buffer.from(invalidFeedback));
      mockChild.emit('close', 0);
    }, 100);

    vi.advanceTimersByTime(100);

    // Act & Assert - The error includes the invalid verdict message
    await expect(resultPromise).rejects.toThrow("Invalid verdict");
    await expect(resultPromise).rejects.toThrow("Must be 'PASS' or 'FAIL'");
  });
});

// Helper to create mock project
function createMockProject(): Project {
  return {
    projectPath: '/test/project',
    ralphDir: '/test/project/.ralph',
    decomposeFeedbackPath: '/test/project/.ralph/decompose_feedback.json',
    logsDir: '/test/project/.ralph/logs',
  } as Project;
}

// Helper to create mock PRDData
function createMockPRDData(): PRDData {
  return {
    projectName: 'Test Project',
    branchName: 'main',
    language: 'nodejs',
    standardsFile: '.ralph/standards/nodejs.md',
    description: 'Test description',
    userStories: [],
  };
}

describe('runPeerReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for readFile to return PRD content
    vi.mocked(fs.readFile).mockImplementation(async (path: Parameters<typeof fs.readFile>[0]) => {
      if (typeof path === 'string' && path.includes('.raw')) {
        return createValidFeedbackJson();
      }
      return '# Test PRD\n\nTest content';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runPeerReview_WithCodexSelected_ShouldUseCodex', async () => {
    // Arrange
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'codex' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '0.39.0',
      command: 'codex',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    // Use setImmediate to schedule the response after spawn
    const resultPromise = runPeerReview(options);

    // Wait for next tick to allow the async setup to complete
    await new Promise(resolve => setImmediate(resolve));

    // Simulate Codex response
    mockChild.stdout!.emit('data', Buffer.from(''));
    mockChild.emit('close', 0);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.cli).toBe('codex');
    expect(spawn).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--output-last-message']),
      expect.any(Object)
    );
  });

  it('runPeerReview_WithClaudeSelected_ShouldUseClaude', async () => {
    // Arrange
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'claude' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '2.1.2',
      command: 'claude',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    const resultPromise = runPeerReview(options);

    // Wait for next tick to allow the async setup to complete
    await new Promise(resolve => setImmediate(resolve));

    // Simulate Claude response
    mockChild.stdout!.emit('data', Buffer.from(createValidFeedbackJson()));
    mockChild.emit('close', 0);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.cli).toBe('claude');
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      ['--print', '--output-format', 'text'],
      expect.any(Object)
    );
  });

  it('runPeerReview_WithUnavailableCli_ShouldReturnError', async () => {
    // Arrange
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'claude' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: false,
      version: '',
      command: 'claude',
    });

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    // Act
    const result = await runPeerReview(options);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('claude CLI not available');
    expect(result.cli).toBe('claude');
    expect(result.feedback.issues).toBeDefined();
    expect(result.feedback.issues![0]).toContain('claude CLI not available');
  });

  it('runPeerReview_WithNoConfig_ShouldDefaultToCodex', async () => {
    // Arrange - loadGlobalSettings returns default settings with codex
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'codex' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '0.39.0',
      command: 'codex',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    const resultPromise = runPeerReview(options);

    // Wait for next tick
    await new Promise(resolve => setImmediate(resolve));

    mockChild.stdout!.emit('data', Buffer.from(''));
    mockChild.emit('close', 0);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.cli).toBe('codex');
    expect(loadGlobalSettings).toHaveBeenCalled();
  });

  it('runPeerReview_ShouldProduceIdenticalLogFormat', async () => {
    // Arrange
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'codex' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '0.39.0',
      command: 'codex',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    const resultPromise = runPeerReview(options);

    // Wait for next tick
    await new Promise(resolve => setImmediate(resolve));

    mockChild.stdout!.emit('data', Buffer.from('stdout output'));
    mockChild.stderr!.emit('data', Buffer.from('stderr output'));
    mockChild.emit('close', 0);

    await resultPromise;

    // Assert - verify log format was written
    const writeCalls = vi.mocked(fs.writeFile).mock.calls;
    const logWriteCall = writeCalls.find(call =>
      typeof call[0] === 'string' && call[0].includes('.log')
    );

    expect(logWriteCall).toBeDefined();
    const logContent = logWriteCall![1] as string;

    // Verify log contains all required sections
    expect(logContent).toContain('=== PEER REVIEW LOG ===');
    expect(logContent).toContain('CLI:');
    expect(logContent).toContain('Attempt:');
    expect(logContent).toContain('Timestamp:');
    expect(logContent).toContain('Exit Code:');
    expect(logContent).toContain('=== STDOUT ===');
    expect(logContent).toContain('=== STDERR ===');
    expect(logContent).toContain('=== PARSED FEEDBACK ===');
  });

  it('runPeerReview_LogFileName_ShouldMatchPattern', async () => {
    // Arrange
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'codex' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '0.39.0',
      command: 'codex',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 2,
    };

    const resultPromise = runPeerReview(options);

    // Wait for next tick
    await new Promise(resolve => setImmediate(resolve));

    mockChild.emit('close', 0);

    // Act
    const result = await resultPromise;

    // Assert - log path should match pattern
    expect(result.logPath).toMatch(/peer_review_attempt_2_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log/);
  });

  it('runPeerReview_WithTimeout_ShouldFailAfter5Minutes', async () => {
    // Arrange - use fake timers for timeout test
    vi.useFakeTimers();

    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'codex' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '0.39.0',
      command: 'codex',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    const resultPromise = runPeerReview(options);

    // Advance timers to resolve async operations
    await vi.advanceTimersByTimeAsync(1);

    // Advance time past the timeout without response
    await vi.advanceTimersByTimeAsync(CODEX_TIMEOUT_MS + 1);

    // Emit close after timeout (simulating killed process)
    mockChild.emit('close', null);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

    vi.useRealTimers();
  });

  it('runPeerReview_WithCliCrash_ShouldCaptureStderrAndFail', async () => {
    // Arrange
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'codex' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '0.39.0',
      command: 'codex',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const stderrMessage = 'Segmentation fault';

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    const resultPromise = runPeerReview(options);

    // Wait for next tick
    await new Promise(resolve => setImmediate(resolve));

    // Simulate spawn error with stderr
    mockChild.stderr!.emit('data', Buffer.from(stderrMessage));
    mockChild.emit('error', new Error('spawn ENOENT'));

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to spawn Codex CLI');
    expect(result.error).toContain(stderrMessage);

    // Verify stderr was captured in log
    const writeCalls = vi.mocked(fs.writeFile).mock.calls;
    const logWriteCall = writeCalls.find(call =>
      typeof call[0] === 'string' && call[0].includes('.log')
    );
    if (logWriteCall) {
      const logContent = logWriteCall[1] as string;
      expect(logContent).toContain(stderrMessage);
    }
  });

  it('runPeerReview_Claude_ShouldReturnValidReviewFeedbackJson', async () => {
    // Arrange
    vi.mocked(loadGlobalSettings).mockResolvedValue({
      reviewer: { cli: 'claude' },
    });
    vi.mocked(detectCli).mockResolvedValue({
      available: true,
      version: '2.1.2',
      command: 'claude',
    });

    const mockChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockChild);

    const validFeedback = {
      verdict: 'FAIL' as const,
      missingRequirements: ['Requirement 1'],
      contradictions: ['Contradiction 1'],
      dependencyErrors: ['Error 1'],
      duplicates: ['Duplicate 1'],
      suggestions: ['Suggestion 1'],
    };

    const options: PeerReviewOptions = {
      prdFile: '/test/prd.md',
      tasks: createMockPRDData(),
      project: createMockProject(),
      attempt: 1,
    };

    const resultPromise = runPeerReview(options);

    // Wait for next tick
    await new Promise(resolve => setImmediate(resolve));

    mockChild.stdout!.emit('data', Buffer.from(JSON.stringify(validFeedback)));
    mockChild.emit('close', 0);

    // Act
    const result = await resultPromise;

    // Assert
    expect(result.success).toBe(true);
    expect(result.cli).toBe('claude');
    expect(result.feedback.verdict).toBe('FAIL');
    // Claude feedback is converted to legacy format with issues array
    expect(result.feedback.issues).toBeDefined();
    expect(result.feedback.issues!.length).toBeGreaterThan(0);
  });
});
