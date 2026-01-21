import { spawn } from 'child_process';
import type { CliDetectionResult, AllCliDetectionResults, CliType } from '../types/index.js';
import { resolveCliPath } from './cli-path.js';

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
    // Resolve the CLI path - handles cases where CLI is an alias not in PATH
    const command = resolveCliPath(cli);
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const result: CliDetectionResult = {
      available: false,
      version: '',
      command: command,  // Use resolved path
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
          command: command,  // Use resolved path
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

/**
 * Model detection result
 */
export interface ModelDetectionResult {
  available: boolean;
  models: string[];
  error?: string;
}

/**
 * Known models for each CLI.
 * These are the recommended short names that work with each CLI.
 */
const KNOWN_MODELS: Record<CliType, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: ['gpt-5', 'gpt-5-codex'],
};

/**
 * Get available models for a CLI.
 * Returns hardcoded list of known models for reliability.
 */
export async function detectModels(cli: CliType): Promise<ModelDetectionResult> {
  const models = KNOWN_MODELS[cli] || [];
  return {
    available: models.length > 0,
    models,
  };
}

/**
 * All CLI model detection results
 */
export interface AllModelDetectionResults {
  codex: ModelDetectionResult;
  claude: ModelDetectionResult;
}

/**
 * Detect models for all CLIs
 */
export async function detectAllModels(): Promise<AllModelDetectionResults> {
  const [codex, claude] = await Promise.all([
    detectModels('codex'),
    detectModels('claude'),
  ]);

  return { codex, claude };
}
