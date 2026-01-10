/**
 * Keep Awake Module
 *
 * Cross-platform system sleep prevention for long-running processes.
 * Prevents the system from going to idle sleep while qala is running.
 *
 * Platform support:
 * - macOS: Uses built-in `caffeinate` command (available since 10.8)
 * - Windows: Uses PowerShell with SetThreadExecutionState Win32 API
 * - Linux: Uses `systemd-inhibit` (available on systemd-based distros)
 *
 * Limitations:
 * - Cannot prevent user-initiated sleep (lid close, power button)
 * - Battery-powered devices may override to preserve battery
 * - Linux non-systemd distros (Alpine, Void) are not supported
 */

import { spawn, ChildProcess } from 'child_process';
import { platform } from 'os';
import * as readline from 'readline';

/** Supported platforms for sleep prevention */
export type SupportedPlatform = 'darwin' | 'win32' | 'linux';

/** Result of attempting to prevent sleep */
export interface KeepAwakeResult {
  /** Whether sleep prevention was successfully started */
  success: boolean;
  /** The platform-specific method being used */
  method: string;
  /** Error message if sleep prevention failed */
  error?: string;
}

/** Internal state for the keep-awake module */
interface KeepAwakeState {
  /** The child process preventing sleep */
  process: ChildProcess | null;
  /** Whether cleanup handlers have been registered */
  cleanupRegistered: boolean;
  /** The method being used */
  method: string | null;
}

const state: KeepAwakeState = {
  process: null,
  cleanupRegistered: false,
  method: null,
};

/**
 * PowerShell script to prevent Windows from sleeping.
 * Uses SetThreadExecutionState Win32 API via P/Invoke.
 *
 * Flags:
 * - ES_CONTINUOUS (0x80000000): Settings persist until changed
 * - ES_SYSTEM_REQUIRED (0x00000001): Prevents automatic sleep
 */
const WINDOWS_POWERSHELL_SCRIPT = `
$Signature = @"
[DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
"@

$ES_CONTINUOUS = [uint32]"0x80000000"
$ES_SYSTEM_REQUIRED = [uint32]"0x00000001"

$Kernel32 = Add-Type -MemberDefinition $Signature -Name Kernel32 -Namespace Win32 -PassThru
$null = $Kernel32::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)

# Keep the process alive - when this exits, the execution state is automatically reset
while ($true) { Start-Sleep -Seconds 60 }
`.trim();

/**
 * Start preventing the system from sleeping.
 *
 * @returns Result indicating success/failure and method used
 *
 * @example
 * ```typescript
 * const result = preventSleep();
 * if (result.success) {
 *   console.log(`Sleep prevention active (${result.method})`);
 * } else {
 *   console.warn(`Sleep prevention unavailable: ${result.error}`);
 * }
 * ```
 */
export function preventSleep(): KeepAwakeResult {
  // Already preventing sleep
  if (state.process !== null) {
    return {
      success: true,
      method: state.method || 'unknown',
    };
  }

  const os = platform();

  try {
    switch (os) {
      case 'darwin':
        return preventSleepMacOS();

      case 'win32':
        return preventSleepWindows();

      case 'linux':
        return preventSleepLinux();

      default:
        return {
          success: false,
          method: 'none',
          error: `Unsupported platform: ${os}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      method: 'none',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * macOS: Use caffeinate command to prevent idle sleep.
 * caffeinate is built-in since macOS 10.8 Mountain Lion (2012).
 */
function preventSleepMacOS(): KeepAwakeResult {
  const method = 'caffeinate';

  try {
    state.process = spawn('caffeinate', ['-i'], {
      stdio: 'ignore',
      detached: false,
    });

    state.process.on('error', (err) => {
      console.warn(`[keep-awake] caffeinate error: ${err.message}`);
      state.process = null;
      state.method = null;
    });

    state.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[keep-awake] caffeinate exited with code ${code}`);
      }
      state.process = null;
      state.method = null;
    });

    state.method = method;
    registerCleanupHandlers();

    return { success: true, method };
  } catch (error) {
    return {
      success: false,
      method,
      error: error instanceof Error ? error.message : 'Failed to start caffeinate',
    };
  }
}

/**
 * Windows: Use PowerShell to call SetThreadExecutionState API.
 * PowerShell 5.1 (powershell.exe) is built-in on Windows 10/11.
 */
function preventSleepWindows(): KeepAwakeResult {
  const method = 'PowerShell SetThreadExecutionState';

  try {
    state.process = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle', 'Hidden',
      '-Command', WINDOWS_POWERSHELL_SCRIPT,
    ], {
      stdio: 'ignore',
      detached: false,
      windowsHide: true,
    });

    state.process.on('error', (err) => {
      console.warn(`[keep-awake] PowerShell error: ${err.message}`);
      state.process = null;
      state.method = null;
    });

    state.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[keep-awake] PowerShell exited with code ${code}`);
      }
      state.process = null;
      state.method = null;
    });

    state.method = method;
    registerCleanupHandlers();

    return { success: true, method };
  } catch (error) {
    return {
      success: false,
      method,
      error: error instanceof Error ? error.message : 'Failed to start PowerShell',
    };
  }
}

/**
 * Linux: Use systemd-inhibit to prevent idle sleep.
 * Available on systemd-based distros (Ubuntu, Fedora, Debian, Arch, etc.)
 */
function preventSleepLinux(): KeepAwakeResult {
  const method = 'systemd-inhibit';

  try {
    state.process = spawn('systemd-inhibit', [
      '--what=idle:sleep',
      '--who=qala',
      '--why=Running Ralph loop',
      '--mode=block',
      'sleep', 'infinity',
    ], {
      stdio: 'ignore',
      detached: false,
    });

    // Handle the case where systemd-inhibit is not available
    let started = true;
    state.process.on('error', (err) => {
      started = false;
      console.warn(`[keep-awake] systemd-inhibit not available: ${err.message}`);
      state.process = null;
      state.method = null;
    });

    state.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[keep-awake] systemd-inhibit exited with code ${code}`);
      }
      state.process = null;
      state.method = null;
    });

    // Give a small delay to check if the process started successfully
    // This is a best-effort check since spawn is async
    if (!started) {
      return {
        success: false,
        method,
        error: 'systemd-inhibit not available (non-systemd distro?)',
      };
    }

    state.method = method;
    registerCleanupHandlers();

    return { success: true, method };
  } catch (error) {
    return {
      success: false,
      method,
      error: error instanceof Error ? error.message : 'Failed to start systemd-inhibit',
    };
  }
}

/**
 * Stop preventing sleep and allow the system to sleep normally.
 * This is called automatically on process exit.
 */
export function allowSleep(): void {
  if (state.process !== null && !state.process.killed) {
    try {
      state.process.kill('SIGTERM');
    } catch {
      // Process may have already exited
    }
    state.process = null;
    state.method = null;
  }
}

/**
 * Check if sleep prevention is currently active.
 */
export function isPreventingSleep(): boolean {
  return state.process !== null && !state.process.killed;
}

/**
 * Get the current method being used for sleep prevention.
 */
export function getCurrentMethod(): string | null {
  return state.method;
}

/**
 * Register cleanup handlers to ensure sleep prevention is stopped on exit.
 * Handles SIGINT (Ctrl+C), SIGTERM, and normal exit.
 */
function registerCleanupHandlers(): void {
  if (state.cleanupRegistered) {
    return;
  }

  const cleanup = (): void => {
    allowSleep();
  };

  // Normal exit
  process.on('exit', cleanup);

  // Ctrl+C
  process.on('SIGINT', () => {
    cleanup();
    // Don't call process.exit() here - let the main process handle it
  });

  // Termination signal
  process.on('SIGTERM', () => {
    cleanup();
    // Don't call process.exit() here - let the main process handle it
  });

  // Windows-specific: Enable SIGINT support
  // By default, Windows doesn't emit SIGINT from Ctrl+C in all scenarios
  if (process.platform === 'win32') {
    try {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.on('SIGINT', () => {
        process.emit('SIGINT', 'SIGINT');
      });

      // Don't let readline keep the process alive
      // Note: unref() exists at runtime but may not be in type definitions
      (rl as unknown as { unref?: () => void }).unref?.();
    } catch {
      // stdin might not be available (e.g., when running as a service)
    }
  }

  state.cleanupRegistered = true;
}
