/**
 * Serena MCP server installation utility.
 *
 * Shared between CLI and server so that both `qala init` (CLI)
 * and `POST /api/projects/init` (web dashboard) configure Serena
 * with `--enable-web-dashboard False`.
 */

import { execSync } from 'child_process';
import { isCliAvailable, isExecutableAvailable } from './cli-path.js';

export interface InstallSerenaResult {
  success: boolean;
  skipped?: string;
  error?: string;
}

export function installSerenaMcp(projectPath: string): InstallSerenaResult {
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
    // May already be configured — not a fatal error
    return { success: false, skipped: 'May already be configured' };
  }
}
