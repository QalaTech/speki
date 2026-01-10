import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { createHash } from 'crypto';
import type { SessionFile } from '../../types/index.js';

/**
 * Gets the session file path for a given spec file.
 * Session files are stored in .ralph/sessions/{basename}.session.json
 *
 * @param specFilePath - Path to the spec file being reviewed
 * @returns Path to the session file in .ralph/sessions/
 */
export function getSessionPath(specFilePath: string): string {
  const specBasename = basename(specFilePath, '.md');
  const projectRoot = process.cwd();
  return join(projectRoot, '.ralph', 'sessions', `${specBasename}.session.json`);
}

/**
 * Loads an existing session file if it exists.
 *
 * @param specFilePath - Path to the spec file being reviewed
 * @returns SessionFile if exists, null otherwise
 */
export async function loadSession(specFilePath: string): Promise<SessionFile | null> {
  const sessionPath = getSessionPath(specFilePath);

  try {
    await access(sessionPath);
    const content = await readFile(sessionPath, 'utf-8');
    return JSON.parse(content) as SessionFile;
  } catch {
    return null;
  }
}

/**
 * Saves a session file to disk.
 * Creates the .ralph/sessions/ directory if it doesn't exist.
 *
 * @param session - The session file to save
 */
export async function saveSession(session: SessionFile): Promise<void> {
  const sessionPath = getSessionPath(session.specFilePath);
  const sessionsDir = dirname(sessionPath);

  await mkdir(sessionsDir, { recursive: true });
  await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Computes a SHA256 hash of the given content.
 * Used to detect if spec file content has changed between sessions.
 *
 * @param content - The content to hash
 * @returns SHA256 hash as hex string
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
