import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { promises as fs } from 'fs';
import {
  runWithClaude,
  CLAUDE_TIMEOUT_MS,
} from '../peer-review.js';

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

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
