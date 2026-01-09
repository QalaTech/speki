import { spawn } from 'child_process';
import type { CliDetectionResult, AllCliDetectionResults, CliType } from '../types/index.js';

/** Timeout for CLI detection in milliseconds */
const CLI_DETECTION_TIMEOUT_MS = 5000;

/**
 * Parse Codex version from --version output.
 * Expected format: "OpenAI Codex v0.39.0" or similar
 */
export function parseCodexVersion(output: string): string {
  const match = output.match(/v?(\d+\.\d+\.\d+)/);
  return match ? match[1] : '';
}

/**
 * Parse Claude version from --version output.
 * Expected format: "2.1.2" or similar
 */
export function parseClaudeVersion(output: string): string {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : '';
}

/**
 * Detect if a CLI tool is available by running it with --version flag.
 * @param cli - The CLI to detect ('codex' or 'claude')
 * @returns Detection result with available flag, version, and command
 */
export async function detectCli(cli: CliType): Promise<CliDetectionResult> {
  return new Promise((resolve) => {
    const command = cli;
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const result: CliDetectionResult = {
      available: false,
      version: '',
      command: cli,
    };

    const child = spawn(command, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        resolve(result);
      }
    }, CLI_DETECTION_TIMEOUT_MS);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);

      if (code === 0) {
        const output = stdout || stderr;
        const version = cli === 'codex'
          ? parseCodexVersion(output)
          : parseClaudeVersion(output);

        resolve({
          available: true,
          version,
          command: cli,
        });
      } else {
        resolve(result);
      }
    });

    child.on('error', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve(result);
    });
  });
}

/**
 * Detect all supported CLI tools (Codex and Claude).
 * @returns Detection results for both CLIs
 */
export async function detectAllClis(): Promise<AllCliDetectionResults> {
  const [codex, claude] = await Promise.all([
    detectCli('codex'),
    detectCli('claude'),
  ]);

  return { codex, claude };
}
