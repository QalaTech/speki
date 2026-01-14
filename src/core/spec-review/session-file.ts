import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { createHash } from 'crypto';
import type { SessionFile } from '../../types/index.js';
import { extractSpecId, getSpecDir, listSpecs } from './spec-metadata.js';

export type ReviewStatus = 'reviewed' | 'pending' | 'god-spec' | 'in-progress' | 'none';

/**
 * Gets the session file path for a given spec file.
 * Session files are stored in .ralph/specs/{specId}/session.json (per-spec isolation)
 *
 * @param specFilePath - Path to the spec file being reviewed
 * @param projectRoot - Optional project root directory (defaults to deriving from specFilePath)
 * @returns Path to the session file in .ralph/specs/{specId}/
 */
export function getSessionPath(specFilePath: string, projectRoot?: string): string {
  const specId = extractSpecId(specFilePath);
  // If projectRoot not provided, derive it from the spec file path
  // Spec files are typically in specs/, docs/, or .ralph/specs/ - find .ralph or use parent
  const resolvedRoot = projectRoot ?? findProjectRoot(specFilePath);
  return join(getSpecDir(resolvedRoot, specId), 'session.json');
}

/**
 * Finds the project root by looking for .ralph directory or using parent of spec dir
 */
function findProjectRoot(specFilePath: string): string {
  const specDir = dirname(specFilePath);
  const specDirName = basename(specDir);

  // If spec is in specs/, docs/, or .ralph/specs/, go up appropriately
  if (specDirName === 'specs' || specDirName === 'docs') {
    return dirname(specDir);
  }
  if (specDir.includes('.ralph')) {
    // Find the .ralph directory and return its parent
    const ralphIndex = specDir.indexOf('.ralph');
    return specDir.substring(0, ralphIndex);
  }
  // Default to cwd if we can't determine
  return process.cwd();
}

/**
 * Loads an existing session file if it exists.
 *
 * @param specFilePath - Path to the spec file being reviewed
 * @param projectRoot - Optional project root directory
 * @returns SessionFile if exists, null otherwise
 */
export async function loadSession(specFilePath: string, projectRoot?: string): Promise<SessionFile | null> {
  const sessionPath = getSessionPath(specFilePath, projectRoot);
  console.log('[loadSession] Looking for session:', { specFilePath, projectRoot, sessionPath });

  try {
    await access(sessionPath);
    const content = await readFile(sessionPath, 'utf-8');
    const session = JSON.parse(content) as SessionFile;
    console.log('[loadSession] Found session:', { sessionId: session.sessionId, status: session.status });
    return session;
  } catch (err) {
    console.log('[loadSession] No session found at:', sessionPath);
    return null;
  }
}

/**
 * Saves a session file to disk.
 * Creates the .ralph/sessions/ directory if it doesn't exist.
 *
 * @param session - The session file to save
 * @param projectRoot - Optional project root directory
 */
export async function saveSession(session: SessionFile, projectRoot?: string): Promise<void> {
  const sessionPath = getSessionPath(session.specFilePath, projectRoot);
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

/**
 * Determines the review status from a session file.
 */
function getStatusFromSession(session: SessionFile): ReviewStatus {
  if (session.reviewResult?.verdict === 'SPLIT_RECOMMENDED') {
    return 'god-spec';
  }

  const suggestions = session.suggestions || [];
  const pendingSuggestions = suggestions.filter((s: { status: string }) => s.status === 'pending');

  if (pendingSuggestions.length > 0) {
    return 'pending';
  }

  if (suggestions.length > 0) {
    return 'reviewed';
  }

  return 'none';
}

/**
 * Gets review statuses for all specs that have session files.
 * Scans per-spec directories under .ralph/specs/{specId}/session.json
 *
 * @param projectRoot - Project root directory
 * @returns Map of spec paths to their review status
 */
export async function getAllSessionStatuses(projectRoot: string): Promise<Record<string, ReviewStatus>> {
  const statuses: Record<string, ReviewStatus> = {};

  try {
    // Get all spec IDs from .ralph/specs/
    const specIds = await listSpecs(projectRoot);

    for (const specId of specIds) {
      try {
        const sessionPath = join(getSpecDir(projectRoot, specId), 'session.json');
        const content = await readFile(sessionPath, 'utf-8');
        const session = JSON.parse(content) as SessionFile;

        if (session.specFilePath) {
          statuses[session.specFilePath] = getStatusFromSession(session);
        }
      } catch {
        // Skip specs without session files
      }
    }
  } catch {
    // Specs directory doesn't exist yet
  }

  return statuses;
}
