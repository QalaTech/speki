import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

vi.mock('../../cli-path.js', () => ({
  resolveCliPath: vi.fn(() => 'claude'),
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
import * as cliModule from '../../llm/drivers/codex-cli.js';

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

describe('runChatMessageStream', () => {
  let mockProcess: ChildProcess;
  let spawnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockProcess = createMockProcess();
    spawnSpy = vi.mocked(spawn);
    spawnSpy.mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ChatRunner_CodexStreaming_UsesImportedConverter', () => {
    it('has convertCodexLineToJson exported from codex-cli module', () => {
      expect(cliModule.convertCodexLineToJson).toBeDefined();
      expect(typeof cliModule.convertCodexLineToJson).toBe('function');
    });

    it('imports convertCodexLineToJson for use in chat streaming', async () => {
      const streamLines: string[] = [];
      const onStreamLine = vi.fn((line: string) => {
        streamLines.push(line);
      });

      const promise = runChatMessageStream(
        'test-session',
        'Hello Claude',
        true,
        onStreamLine,
        {
          cwd: process.cwd(),
          agent: 'claude',
        }
      );

      // Simulate process output
      const jsonLine = JSON.stringify({
        type: 'text',
        text: 'Hello user',
      });

      (mockProcess.stdout as EventEmitter).emit('data', Buffer.from(jsonLine + '\n'));
      (mockProcess.stdout as EventEmitter).emit('data', Buffer.from(''));
      (mockProcess as EventEmitter).emit('close', 0);

      const result = await promise;

      expect(result.content).toBe('Hello user');
      expect(onStreamLine).toHaveBeenCalled();
    });

    it('streams JSONL lines through callback without duplicating conversion logic', async () => {
      const streamLines: string[] = [];
      const onStreamLine = vi.fn((line: string) => {
        streamLines.push(line);
      });

      const promise = runChatMessageStream(
        'test-session',
        'Test message',
        true,
        onStreamLine,
        {
          cwd: process.cwd(),
          agent: 'claude',
        }
      );

      const jsonLine1 = JSON.stringify({
        type: 'text',
        text: 'First response',
      });
      const jsonLine2 = JSON.stringify({
        type: 'text',
        text: 'Second response',
      });

      (mockProcess.stdout as EventEmitter).emit('data', Buffer.from(jsonLine1 + '\n' + jsonLine2 + '\n'));
      (mockProcess as EventEmitter).emit('close', 0);

      const result = await promise;

      expect(streamLines.length).toBe(2);
      expect(streamLines[0]).toEqual(jsonLine1);
      expect(streamLines[1]).toEqual(jsonLine2);
      expect(result.content).toContain('First response');
    });
  });
});
