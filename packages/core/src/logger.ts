/**
 * Qala Logger
 *
 * Minimal, centralized logger with levels and optional scoping.
 * Env configuration:
 * - QALA_LOG_LEVEL: debug | info | warn | error | silent (default: info)
 * - QALA_DEBUG=1 implies debug level
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 90,
};

function resolveInitialLevel(): LogLevel {
  if (process.env.QALA_DEBUG === '1') return 'debug';
  const env = (process.env.QALA_LOG_LEVEL || '').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error' || env === 'silent') {
    return env as LogLevel;
  }
  return 'info';
}

let currentLevel: LogLevel = resolveInitialLevel();

export function setLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLevel(): LogLevel {
  return currentLevel;
}

export function isDebugEnabled(): boolean {
  return LEVELS[currentLevel] <= LEVELS.debug;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= 0 && LEVELS[level] >= LEVELS[currentLevel] && currentLevel !== 'silent';
}

function prefix(scope?: string): string {
  return scope ? `[${scope}] ` : '';
}

export function debug(msg: string, scope?: string): void {
  if (!isDebugEnabled()) return;
  // Use console.debug where available
  // eslint-disable-next-line no-console
  console.debug(prefix(scope) + msg);
}

export function info(msg: string, scope?: string): void {
  if (!shouldLog('info')) return;
  // eslint-disable-next-line no-console
  console.log(prefix(scope) + msg);
}

export function warn(msg: string, scope?: string): void {
  if (!shouldLog('warn')) return;
  // eslint-disable-next-line no-console
  console.warn(prefix(scope) + msg);
}

export function error(msg: string, scope?: string): void {
  if (!shouldLog('error')) return;
  // eslint-disable-next-line no-console
  console.error(prefix(scope) + msg);
}

export function scoped(scope: string) {
  return {
    debug: (msg: string) => debug(msg, scope),
    info: (msg: string) => info(msg, scope),
    warn: (msg: string) => warn(msg, scope),
    error: (msg: string) => error(msg, scope),
  };
}

