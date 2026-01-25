/**
 * Change tracker module for spec review sessions.
 * Tracks changes made during review and enables reverting individual or all changes.
 */

import { writeFile } from 'fs/promises';
import type { ChangeHistoryEntry, SessionFile } from '../types/index.js';
import { saveSession } from './session-file.js';

/**
 * Result of a revert operation.
 */
export interface RevertResult {
  success: boolean;
  change: ChangeHistoryEntry;
}

/**
 * Result of reverting all changes.
 */
export interface RevertAllResult {
  success: boolean;
  revertedCount: number;
  changes: ChangeHistoryEntry[];
}

/**
 * Tracks a change by adding it to the session's change history and persisting.
 * @param session The session to add the change to
 * @param entry The change entry to track
 * @returns The updated session
 */
export async function trackChange(
  session: SessionFile,
  entry: ChangeHistoryEntry
): Promise<SessionFile> {
  const updatedSession: SessionFile = {
    ...session,
    changeHistory: [...session.changeHistory, entry],
    lastUpdatedAt: new Date().toISOString(),
  };

  await saveSession(updatedSession);
  return updatedSession;
}

/**
 * Reverts a specific change by restoring the file to its previous content.
 * @param session The session containing the change
 * @param changeId The ID of the change to revert
 * @returns Result containing the updated change entry
 * @throws Error if change is not found or already reverted
 */
export async function revertChange(
  session: SessionFile,
  changeId: string
): Promise<RevertResult> {
  const changeIndex = session.changeHistory.findIndex((c) => c.id === changeId);

  if (changeIndex === -1) {
    throw new Error(`Change not found: ${changeId}`);
  }

  const change = session.changeHistory[changeIndex];

  if (change.reverted) {
    throw new Error(`Change has already been reverted: ${changeId}`);
  }

  await writeFile(change.filePath, change.beforeContent, 'utf-8');

  const revertedChange: ChangeHistoryEntry = {
    ...change,
    reverted: true,
  };

  session.changeHistory[changeIndex] = revertedChange;
  session.lastUpdatedAt = new Date().toISOString();

  await saveSession(session);

  return {
    success: true,
    change: revertedChange,
  };
}

/**
 * Reverts all non-reverted changes in the session, restoring original content.
 * Changes are reverted in reverse order (most recent first).
 * @param session The session containing changes to revert
 * @returns Result containing all reverted changes
 */
export async function revertAll(session: SessionFile): Promise<RevertAllResult> {
  const unrevertedChanges = session.changeHistory.filter((c) => !c.reverted);

  if (unrevertedChanges.length === 0) {
    return {
      success: true,
      revertedCount: 0,
      changes: [],
    };
  }

  const reversedChanges = [...unrevertedChanges].reverse();
  const revertedChanges: ChangeHistoryEntry[] = [];

  for (const change of reversedChanges) {
    await writeFile(change.filePath, change.beforeContent, 'utf-8');

    const changeIndex = session.changeHistory.findIndex((c) => c.id === change.id);
    const revertedChange: ChangeHistoryEntry = {
      ...change,
      reverted: true,
    };

    session.changeHistory[changeIndex] = revertedChange;
    revertedChanges.push(revertedChange);
  }

  session.lastUpdatedAt = new Date().toISOString();
  await saveSession(session);

  return {
    success: true,
    revertedCount: revertedChanges.length,
    changes: revertedChanges,
  };
}

/**
 * Gets the original content of the spec file from the change history.
 * This is the content before any changes were made.
 * @param session The session to get original content from
 * @returns The original content, or null if no changes exist
 */
export function getOriginalContent(session: SessionFile): string | null {
  return session.changeHistory[0]?.beforeContent ?? null;
}
