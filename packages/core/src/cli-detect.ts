import { spawn } from 'child_process';
import type { CliDetectionResult, AllCliDetectionResults, CliType } from './types/index.js';
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
 * Parse Gemini version from --version output.
 * Expected format: "Gemini CLI v0.20.0" or similar
 */
export function parseGeminiVersion(output: string): string {
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
          : cli === 'gemini'
            ? parseGeminiVersion(output)
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
  const [codex, claude, gemini] = await Promise.all([
    detectCli('codex'),
    detectCli('claude'),
    detectCli('gemini'),
  ]);

  return { codex, claude, gemini };
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
 * Use explicit model IDs to ensure correct version is used.
 * Claude: https://platform.claude.com/docs/en/about-claude/models/overview
 * Codex: https://developers.openai.com/codex/models/
 */
const KNOWN_MODELS: Record<CliType, string[]> = {
  gemini: [
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
  ],
  claude: [
    // Latest Claude 4.6 model (recommended)
    'claude-opus-4-6',             // Claude Opus 4.6 - most intelligent, 200K/1M context
    // Claude 4.5 models
    'claude-sonnet-4-5-20250929',  // Claude Sonnet 4.5 - best balance of intelligence/speed/cost
    'claude-haiku-4-5-20251001',   // Claude Haiku 4.5 - fastest with near-frontier intelligence
    // Aliases (auto-point to latest snapshot)
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    // Legacy models
    'claude-opus-4-5-20251101',    // Claude Opus 4.5
    'claude-opus-4-5',
    'claude-sonnet-4-20250514',    // Claude Sonnet 4
    'claude-opus-4-20250514',      // Claude Opus 4
  ],
  codex: [
    // Latest Codex-optimized models (recommended)
    'gpt-5.3-codex',               // Most capable agentic coding model
    'gpt-5.2-codex',               // Advanced agentic coding model
    'gpt-5.1-codex-mini',          // Economical alternative
    'gpt-5.1-codex-max',           // Extended agentic coding tasks
    'gpt-5-codex-mini',            // Smaller cost-effective option
    // General GPT-5 models
    'gpt-5.2',                     // General-purpose agentic model
    'gpt-5.1',                     // Strong for coding and agentic work
    // Reasoning models
    'o3',                          // Top reasoning model
    'o4-mini',                     // Fast reasoning model
    // Legacy models
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
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
  gemini: ModelDetectionResult;
}

/**
 * Detect models for all CLIs
 */
export async function detectAllModels(): Promise<AllModelDetectionResults> {
  const [codex, claude, gemini] = await Promise.all([
    detectModels('codex'),
    detectModels('claude'),
    detectModels('gemini'),
  ]);

  return { codex, claude, gemini };
}
