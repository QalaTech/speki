import { Engine, EngineAvailability, RunStreamOptions, RunStreamResult, RunChatOptions, RunChatResult } from '../engine.js';
import { detectCli } from '../../cli-detect.js';
import { runClaude } from '../../claude/runner.js';
import { runChatMessage } from '../../spec-review/chat-runner.js';

export class ClaudeCliEngine implements Engine {
  name = 'claude-cli';

  async isAvailable(): Promise<EngineAvailability> {
    const d = await detectCli('claude');
    return { available: d.available, name: this.name, version: d.version };
  }

  async runStream(options: RunStreamOptions): Promise<RunStreamResult> {
    const result = await runClaude({
      promptPath: options.promptPath,
      cwd: options.cwd,
      logDir: options.logDir,
      iteration: options.iteration,
      callbacks: options.callbacks,
      skipPermissions: options.skipPermissions ?? true,
    });
    return {
      success: result.success,
      isComplete: result.isComplete,
      durationMs: result.durationMs,
      output: result.output,
      jsonlPath: result.jsonlPath,
      stderrPath: result.stderrPath,
      exitCode: result.exitCode,
      claudePid: result.claudePid,
    };
  }

  async runChat(options: RunChatOptions): Promise<RunChatResult> {
    const res = await runChatMessage(options.sessionId, options.message, options.isFirstMessage, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      specContent: options.specContent,
      specPath: options.specPath,
    });
    return res;
  }
}

