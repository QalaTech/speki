import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Engine } from '../../llm/engine.js';

// Mock selectEngine to avoid circular dependencies and spawning real processes
vi.mock('../../llm/engine-factory.js', () => ({
  selectEngine: vi.fn(),
}));

vi.mock('../../settings.js', () => ({
  loadGlobalSettings: vi.fn(() =>
    Promise.resolve({
      specChat: {
        agent: 'claude',
        model: 'claude-3-5-sonnet-20241022',
      },
    })
  ),
}));

import { runChatMessageStream } from '../chat-runner.js';
import { selectEngine } from '../../llm/engine-factory.js';

// Helper to create a mock engine with all required methods
function createMockEngine(overrides?: Partial<Engine>): Engine {
  return {
    name: 'mock-engine',
    isAvailable: vi.fn().mockResolvedValue({ available: true }),
    runStream: vi.fn(),
    runChat: vi.fn(),
    runReview: vi.fn(),
    ...overrides,
  };
}

describe('runChatMessageStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ChatRunner_Claude_DelegatesToClaudeEngine', () => {
    it('selects Claude engine and delegates to runChat', async () => {
      const mockEngine = createMockEngine({
        runChat: vi.fn().mockResolvedValue({
          content: 'Claude response',
          durationMs: 100,
        }),
      });

      vi.mocked(selectEngine).mockResolvedValue({
        engine: mockEngine,
        engineName: 'claude-cli',
        model: 'claude-3-5-sonnet-20241022',
      });

      const onStreamLine = vi.fn();
      const result = await runChatMessageStream(
        'session-123',
        'Hello Claude',
        true,
        onStreamLine,
        {
          agent: 'claude',
          specContent: 'Test spec',
          specPath: '/path/to/spec.md',
        }
      );

      // Verify selectEngine was called
      expect(selectEngine).toHaveBeenCalledWith({
        engineName: 'claude',
        model: undefined,
        purpose: 'specChat',
      });

      // Verify engine.runChat was called with correct parameters
      expect(mockEngine.runChat).toHaveBeenCalledWith({
        sessionId: 'session-123',
        message: 'Hello Claude',
        isFirstMessage: true,
        cwd: process.cwd(),
        timeoutMs: 1_200_000,
        model: 'claude-3-5-sonnet-20241022',
        specContent: 'Test spec',
        specPath: '/path/to/spec.md',
        onStreamLine,
      });

      expect(result.content).toBe('Claude response');
      expect(result.durationMs).toBe(100);
    });
  });

  describe('ChatRunner_Codex_DelegatesToCodexEngine', () => {
    it('selects Codex engine and delegates to runChat', async () => {
      const mockEngine = createMockEngine({
        runChat: vi.fn().mockResolvedValue({
          content: 'Codex response',
          durationMs: 150,
        }),
      });

      vi.mocked(selectEngine).mockResolvedValue({
        engine: mockEngine,
        engineName: 'codex-cli',
        model: 'gpt-4-turbo',
      });

      const onStreamLine = vi.fn();
      const result = await runChatMessageStream(
        'session-456',
        'Hello Codex',
        false,
        onStreamLine,
        {
          agent: 'codex',
          model: 'gpt-4-turbo',
          specContent: 'Another spec',
        }
      );

      // Verify selectEngine was called with codex
      expect(selectEngine).toHaveBeenCalledWith({
        engineName: 'codex',
        model: 'gpt-4-turbo',
        purpose: 'specChat',
      });

      // Verify engine.runChat was called with Codex options
      expect(mockEngine.runChat).toHaveBeenCalledWith({
        sessionId: 'session-456',
        message: 'Hello Codex',
        isFirstMessage: false,
        cwd: process.cwd(),
        timeoutMs: 1_200_000,
        model: 'gpt-4-turbo',
        specContent: 'Another spec',
        specPath: undefined,
        onStreamLine,
      });

      expect(result.content).toBe('Codex response');
      expect(result.durationMs).toBe(150);
    });
  });

  describe('ChatRunner_StreamCallback_InvokedByEngine', () => {
    it('passes streaming callback to engine and forwards response', async () => {
      const streamedLines: string[] = [];
      const onStreamLine = vi.fn((line: string) => {
        streamedLines.push(line);
      });

      const mockEngine = createMockEngine({
        runChat: vi.fn(async (options) => {
          // Simulate engine calling the callback
          if (options.onStreamLine) {
            options.onStreamLine('{"type":"text","text":"Line 1"}');
            options.onStreamLine('{"type":"text","text":"Line 2"}');
          }
          return {
            content: 'Streamed response',
            durationMs: 200,
          };
        }),
      });

      vi.mocked(selectEngine).mockResolvedValue({
        engine: mockEngine,
        engineName: 'claude-cli',
        model: 'claude-3-5-sonnet',
      });

      const result = await runChatMessageStream(
        'session-789',
        'Stream test',
        true,
        onStreamLine
      );

      // Verify callback was invoked by engine
      expect(onStreamLine).toHaveBeenCalledTimes(2);
      expect(streamedLines).toContain('{"type":"text","text":"Line 1"}');
      expect(streamedLines).toContain('{"type":"text","text":"Line 2"}');

      expect(result.content).toBe('Streamed response');
    });
  });

  describe('ChatRunner_Timeout_HandledByEngine', () => {
    it('engine timeout errors are passed through', async () => {
      const mockEngine = createMockEngine({
        runChat: vi.fn().mockResolvedValue({
          content: '',
          durationMs: 120000,
          error: 'Chat timed out',
        }),
      });

      vi.mocked(selectEngine).mockResolvedValue({
        engine: mockEngine,
        engineName: 'claude-cli',
        model: 'claude-3-5-sonnet',
      });

      const result = await runChatMessageStream(
        'session-timeout',
        'Slow message',
        true,
        vi.fn(),
        {
          timeoutMs: 120000,
        }
      );

      // Verify timeout error is passed through from engine
      expect(result.error).toBe('Chat timed out');
      expect(result.durationMs).toBe(120000);
      expect(result.content).toBe('');
    });
  });
});
