import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import {
  detectCli,
  detectAllClis,
  parseCodexVersion,
  parseClaudeVersion,
} from '../cli-detect.js';

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock cli-path to return simple command names
vi.mock('../cli-path.js', () => ({
  resolveCliPath: vi.fn((cli: string) => cli),
}));

// Helper to create a mock child process
function createMockChildProcess(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new EventEmitter() as unknown as Readable;
  child.stderr = new EventEmitter() as unknown as Readable;
  child.kill = vi.fn();
  return child;
}

describe('cli-detect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('parseCodexVersion', () => {
    it('parseCodexVersion_WithValidOutput_ShouldExtractVersion', () => {
      // Arrange
      const output = 'OpenAI Codex v0.39.0';

      // Act
      const version = parseCodexVersion(output);

      // Assert
      expect(version).toBe('0.39.0');
    });

    it('should handle version without v prefix', () => {
      const output = 'OpenAI Codex 0.39.0';
      const version = parseCodexVersion(output);
      expect(version).toBe('0.39.0');
    });

    it('should return empty string for invalid output', () => {
      const output = 'No version here';
      const version = parseCodexVersion(output);
      expect(version).toBe('');
    });
  });

  describe('parseClaudeVersion', () => {
    it('parseClaudeVersion_WithValidOutput_ShouldExtractVersion', () => {
      // Arrange
      const output = '2.1.2';

      // Act
      const version = parseClaudeVersion(output);

      // Assert
      expect(version).toBe('2.1.2');
    });

    it('should handle multiline output', () => {
      const output = 'claude-cli\nversion 2.1.2\n';
      const version = parseClaudeVersion(output);
      expect(version).toBe('2.1.2');
    });

    it('should return empty string for invalid output', () => {
      const output = 'No version here';
      const version = parseClaudeVersion(output);
      expect(version).toBe('');
    });
  });

  describe('detectCli', () => {
    it('detectCli_WithInstalledCli_ShouldReturnAvailableTrue', async () => {
      // Arrange
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild);

      const detectPromise = detectCli('codex');

      // Simulate successful version output
      setTimeout(() => {
        mockChild.stdout!.emit('data', Buffer.from('OpenAI Codex v0.39.0'));
        mockChild.emit('close', 0);
      }, 100);

      vi.advanceTimersByTime(100);

      // Act
      const result = await detectPromise;

      // Assert
      expect(result).toEqual({
        available: true,
        version: '0.39.0',
        command: 'codex',
      });
      expect(spawn).toHaveBeenCalledWith('codex', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    });

    it('detectCli_WithMissingCli_ShouldReturnAvailableFalse', async () => {
      // Arrange
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild);

      const detectPromise = detectCli('codex');

      // Simulate spawn error (command not found)
      setTimeout(() => {
        mockChild.emit('error', new Error('spawn ENOENT'));
      }, 100);

      vi.advanceTimersByTime(100);

      // Act
      const result = await detectPromise;

      // Assert
      expect(result).toEqual({
        available: false,
        version: '',
        command: 'codex',
      });
    });

    it('detectCli_WithTimeout_ShouldReturnAvailableFalse', async () => {
      // Arrange
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild);

      const detectPromise = detectCli('codex');

      // Advance time past the 5 second timeout without any response
      vi.advanceTimersByTime(5001);

      // Act
      const result = await detectPromise;

      // Assert
      expect(result).toEqual({
        available: false,
        version: '',
        command: 'codex',
      });
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should handle non-zero exit code', async () => {
      // Arrange
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild);

      const detectPromise = detectCli('claude');

      // Simulate non-zero exit
      setTimeout(() => {
        mockChild.emit('close', 1);
      }, 100);

      vi.advanceTimersByTime(100);

      // Act
      const result = await detectPromise;

      // Assert
      expect(result).toEqual({
        available: false,
        version: '',
        command: 'claude',
      });
    });

    it('should detect claude CLI correctly', async () => {
      // Arrange
      const mockChild = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockChild);

      const detectPromise = detectCli('claude');

      // Simulate successful version output
      setTimeout(() => {
        mockChild.stdout!.emit('data', Buffer.from('2.1.2'));
        mockChild.emit('close', 0);
      }, 100);

      vi.advanceTimersByTime(100);

      // Act
      const result = await detectPromise;

      // Assert
      expect(result).toEqual({
        available: true,
        version: '2.1.2',
        command: 'claude',
      });
    });
  });

  describe('detectAllClis', () => {
    it('detectAllClis_ShouldReturnBothCodexAndClaudeWithCommandField', async () => {
      // Arrange
      const mockCodexChild = createMockChildProcess();
      const mockClaudeChild = createMockChildProcess();

      vi.mocked(spawn)
        .mockReturnValueOnce(mockCodexChild)
        .mockReturnValueOnce(mockClaudeChild);

      const detectPromise = detectAllClis();

      // Simulate both CLIs responding
      setTimeout(() => {
        mockCodexChild.stdout!.emit('data', Buffer.from('OpenAI Codex v0.39.0'));
        mockCodexChild.emit('close', 0);
        mockClaudeChild.stdout!.emit('data', Buffer.from('2.1.2'));
        mockClaudeChild.emit('close', 0);
      }, 100);

      vi.advanceTimersByTime(100);

      // Act
      const result = await detectPromise;

      // Assert
      expect(result).toEqual({
        codex: {
          available: true,
          version: '0.39.0',
          command: 'codex',
        },
        claude: {
          available: true,
          version: '2.1.2',
          command: 'claude',
        },
      });
    });

    it('should handle mixed availability', async () => {
      // Arrange
      const mockCodexChild = createMockChildProcess();
      const mockClaudeChild = createMockChildProcess();

      vi.mocked(spawn)
        .mockReturnValueOnce(mockCodexChild)
        .mockReturnValueOnce(mockClaudeChild);

      const detectPromise = detectAllClis();

      // Simulate codex available, claude unavailable
      setTimeout(() => {
        mockCodexChild.stdout!.emit('data', Buffer.from('OpenAI Codex v0.39.0'));
        mockCodexChild.emit('close', 0);
        mockClaudeChild.emit('error', new Error('spawn ENOENT'));
      }, 100);

      vi.advanceTimersByTime(100);

      // Act
      const result = await detectPromise;

      // Assert
      expect(result.codex.available).toBe(true);
      expect(result.codex.command).toBe('codex');
      expect(result.claude.available).toBe(false);
      expect(result.claude.command).toBe('claude');
    });
  });
});
