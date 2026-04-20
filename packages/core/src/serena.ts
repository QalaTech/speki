/**
 * Serena MCP server installation utility.
 *
 * Shared between CLI and server so that both `qala init` (CLI)
 * and `POST /api/projects/init` (web dashboard) configure Serena
 * with `--enable-web-dashboard False`.
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { isCliAvailable, isExecutableAvailable } from './cli-path.js';

const execAsync = promisify(exec);

export interface InstallSerenaResult {
  success: boolean;
  skipped?: string;
  error?: string;
}

export async function installSerenaMcp(projectPath: string): Promise<InstallSerenaResult> {
  if (!isCliAvailable('claude')) {
    return { success: false, skipped: 'Claude CLI not found' };
  }

  if (!isExecutableAvailable('uv')) {
    return { success: false, skipped: 'uv not found' };
  }

  try {
    await execAsync(
      `claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context claude-code --project "${projectPath}" --enable-web-dashboard False`
    );
    return { success: true };
  } catch {
    // May already be configured — not a fatal error
    return { success: false, skipped: 'May already be configured' };
  }
}

/**
 * Synchronous variant retained for CLI contexts (e.g. `qala init`) where
 * blocking until completion is desired. Not safe to call from request handlers.
 */
export function installSerenaMcpSync(projectPath: string): InstallSerenaResult {
  if (!isCliAvailable('claude')) {
    return { success: false, skipped: 'Claude CLI not found' };
  }

  if (!isExecutableAvailable('uv')) {
    return { success: false, skipped: 'uv not found' };
  }

  try {
    execSync(
      `claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context claude-code --project "${projectPath}" --enable-web-dashboard False`,
      { stdio: 'pipe' }
    );
    return { success: true };
  } catch {
    return { success: false, skipped: 'May already be configured' };
  }
}
