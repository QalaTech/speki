/**
 * CLI Path Resolution Utility
 *
 * Resolves the full path to CLI executables (claude, codex).
 * Handles cases where CLIs are defined as shell aliases rather than being in PATH.
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { CliType } from '../types/index.js';

/** Cache for resolved CLI paths */
const pathCache: Map<CliType, string | null> = new Map();

/**
 * Common installation paths for CLI tools
 */
const COMMON_PATHS: Record<CliType, string[]> = {
  claude: [
    join(homedir(), '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ],
  codex: [
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
    join(homedir(), '.local', 'bin', 'codex'),
  ],
};

/**
 * Try to find CLI in PATH using 'which' command
 * @param cli - The CLI name to find
 * @returns The path or null if not found
 */
function resolveFromWhich(cli: CliType): string | null {
  try {
    // Use execFileSync for safety - no shell injection possible
    const result = execFileSync('which', [cli], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (result && existsSync(result)) {
      return result;
    }
  } catch {
    // which failed, CLI not in PATH
  }

  return null;
}

/**
 * Check common installation paths
 * @param cli - The CLI name to find
 * @returns The path or null if not found
 */
function resolveFromCommonPaths(cli: CliType): string | null {
  const paths = COMMON_PATHS[cli] || [];
  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

/**
 * Resolve the full path to a CLI executable.
 *
 * Resolution order:
 * 1. Check cache for previously resolved path
 * 2. Try 'which' command (PATH lookup)
 * 3. Check common installation paths
 *
 * @param cli - The CLI to resolve ('claude' or 'codex')
 * @param useCache - Whether to use cached results (default: true)
 * @returns The full path to the CLI executable, or the CLI name if not found
 */
export function resolveCliPath(cli: CliType, useCache: boolean = true): string {
  // Check cache first
  if (useCache && pathCache.has(cli)) {
    const cached = pathCache.get(cli);
    return cached || cli;
  }

  // Try resolution methods in order
  let resolvedPath: string | null = null;

  // 1. Try which (PATH lookup)
  resolvedPath = resolveFromWhich(cli);

  // 2. Check common installation paths
  if (!resolvedPath) {
    resolvedPath = resolveFromCommonPaths(cli);
  }

  // Cache the result
  pathCache.set(cli, resolvedPath);

  // Return resolved path or fall back to CLI name
  return resolvedPath || cli;
}

/**
 * Clear the CLI path cache.
 * Useful when CLI installation state may have changed.
 */
export function clearCliPathCache(): void {
  pathCache.clear();
}

/**
 * Check if a CLI is available at its resolved path.
 * @param cli - The CLI to check
 * @returns True if the CLI exists at its resolved path
 */
export function isCliAvailable(cli: CliType): boolean {
  const path = resolveCliPath(cli);
  // If path equals cli name, it wasn't resolved (not found)
  if (path === cli) {
    return false;
  }
  return existsSync(path);
}
