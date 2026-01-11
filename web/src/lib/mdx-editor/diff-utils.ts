/**
 * Diff view utilities for the spec review feature.
 * Provides functions for entering/exiting diff mode, getting proposed content,
 * and generating unified diffs.
 */

import { createTwoFilesPatch } from 'diff';
import type { SpecEditorRef } from '../../components/SpecEditor';

/**
 * Location information for scrolling to a specific section after entering diff mode.
 */
export interface DiffLocation {
  /** The line number to scroll to (1-indexed) */
  lineNumber?: number;
  /** The section heading to scroll to */
  sectionHeading?: string;
}

/**
 * State for managing diff view mode.
 * This is stored separately from the editor since MDXEditor's view mode
 * is controlled via plugin configuration at render time.
 */
export interface DiffViewState {
  /** Whether diff mode is currently active */
  isActive: boolean;
  /** The original content before changes */
  originalContent: string;
  /** The proposed content to compare against */
  proposedContent: string;
  /** Location to scroll to when diff is shown */
  location?: DiffLocation;
}

/**
 * Creates an initial diff view state.
 */
export function createInitialDiffState(): DiffViewState {
  return {
    isActive: false,
    originalContent: '',
    proposedContent: '',
    location: undefined,
  };
}

/**
 * Enters diff mode by preparing the diff view state.
 * The actual view mode change is handled by the SpecEditor component
 * via the viewMode prop and diffMarkdown configuration.
 *
 * @param editorRef - The SpecEditor ref for getting current content
 * @param original - The original content to compare from
 * @param proposed - The proposed content to compare to
 * @param location - Optional location to scroll to after entering diff mode
 * @returns The diff view state to use with the editor
 */
export function showDiff(
  editorRef: React.RefObject<SpecEditorRef>,
  original: string,
  proposed: string,
  location?: DiffLocation
): DiffViewState {
  if (!editorRef.current) {
    return createInitialDiffState();
  }

  return {
    isActive: true,
    originalContent: original,
    proposedContent: proposed,
    location,
  };
}

/**
 * Exits diff mode and optionally applies the changes.
 * When applyChanges is true, the proposed content becomes the new content.
 * When applyChanges is false, the original content is restored.
 *
 * @param editorRef - The SpecEditor ref for setting content
 * @param applyChanges - Whether to apply the proposed changes or revert to original
 * @param diffState - The current diff view state
 * @returns The new content after exiting diff mode
 */
export function exitDiffView(
  editorRef: React.RefObject<SpecEditorRef>,
  applyChanges: boolean,
  diffState: DiffViewState
): string {
  if (!editorRef.current) {
    return diffState.originalContent;
  }

  const finalContent = applyChanges
    ? getProposedContent(editorRef) ?? diffState.proposedContent
    : diffState.originalContent;

  editorRef.current.setMarkdown(finalContent);

  return finalContent;
}

/**
 * Gets the proposed content from the editor.
 * This returns the current content in the editor, which may have been
 * modified by the user while in diff view.
 *
 * @param editorRef - The SpecEditor ref
 * @returns The current markdown content, or null if editor is not available
 */
export function getProposedContent(
  editorRef: React.RefObject<SpecEditorRef>
): string | null {
  return editorRef.current?.getMarkdown() ?? null;
}

/**
 * Options for unified diff generation.
 */
export interface UnifiedDiffOptions {
  /** Number of context lines around changes. @default 3 */
  contextLines?: number;
  /** The filename to show for the original file. @default 'original' */
  originalFileName?: string;
  /** The filename to show for the modified file. @default 'modified' */
  modifiedFileName?: string;
}

/**
 * Creates a unified diff string from two content strings.
 * Uses the standard unified diff format compatible with most diff viewers.
 *
 * @param original - The original content
 * @param modified - The modified content
 * @param options - Optional configuration for diff generation
 * @returns The unified diff string
 */
export function createUnifiedDiff(
  original: string,
  modified: string,
  options?: UnifiedDiffOptions
): string {
  const contextLines = options?.contextLines ?? 3;
  const originalFileName = options?.originalFileName ?? 'original';
  const modifiedFileName = options?.modifiedFileName ?? 'modified';

  return createTwoFilesPatch(
    originalFileName,
    modifiedFileName,
    original,
    modified,
    '',
    '',
    { context: contextLines }
  );
}

/**
 * Checks if two content strings have any differences.
 *
 * @param original - The original content
 * @param modified - The modified content
 * @returns True if the contents are different, false otherwise
 */
export function hasDifferences(original: string, modified: string): boolean {
  return original !== modified;
}

/**
 * Counts the number of changed lines in a diff.
 * Returns separate counts for added and removed lines.
 *
 * @param diff - The unified diff string
 * @returns Object with counts for added and removed lines
 */
export function countDiffChanges(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }

  return { added, removed };
}
