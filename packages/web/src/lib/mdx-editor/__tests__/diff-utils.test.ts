import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpecEditorRef } from '../../../components/SpecEditor';
import {
  showDiff,
  exitDiffView,
  getProposedContent,
  createUnifiedDiff,
  createInitialDiffState,
  hasDifferences,
  countDiffChanges,
  type DiffViewState,
} from '../diff-utils';

/**
 * Creates a mock SpecEditorRef for testing.
 */
function createMockEditorRef(markdown: string = ''): React.RefObject<SpecEditorRef> {
  const ref = {
    current: {
      getMarkdown: vi.fn(() => markdown),
      setMarkdown: vi.fn(),
      focus: vi.fn(),
      insertMarkdown: vi.fn(),
      getEditorMethods: vi.fn(() => null),
    },
  };
  return ref;
}

/**
 * Creates a null SpecEditorRef for testing null cases.
 */
function createNullEditorRef(): React.RefObject<SpecEditorRef> {
  return { current: null };
}

describe('diff-utils', () => {
  describe('showDiff_EntersDiffMode', () => {
    it('should return active diff state with provided content', () => {
      const editorRef = createMockEditorRef('current content');
      const original = '# Original Content\n\nThis is the original.';
      const proposed = '# Modified Content\n\nThis is modified.';

      const result = showDiff(editorRef, original, proposed);

      expect(result.isActive).toBe(true);
      expect(result.originalContent).toBe(original);
      expect(result.proposedContent).toBe(proposed);
    });

    it('should include location when provided', () => {
      const editorRef = createMockEditorRef();
      const location = { lineNumber: 10, sectionHeading: 'Requirements' };

      const result = showDiff(editorRef, 'original', 'proposed', location);

      expect(result.location).toEqual(location);
      expect(result.location?.lineNumber).toBe(10);
      expect(result.location?.sectionHeading).toBe('Requirements');
    });

    it('should return inactive state when editor ref is null', () => {
      const editorRef = createNullEditorRef();

      const result = showDiff(editorRef, 'original', 'proposed');

      expect(result.isActive).toBe(false);
      expect(result.originalContent).toBe('');
      expect(result.proposedContent).toBe('');
    });
  });

  describe('exitDiffView_ExitsDiffMode', () => {
    let diffState: DiffViewState;

    beforeEach(() => {
      diffState = {
        isActive: true,
        originalContent: '# Original\n\nOriginal content here.',
        proposedContent: '# Proposed\n\nProposed content here.',
      };
    });

    it('should set markdown to original when not applying changes', () => {
      const editorRef = createMockEditorRef(diffState.proposedContent);

      const result = exitDiffView(editorRef, false, diffState);

      expect(editorRef.current!.setMarkdown).toHaveBeenCalledWith(diffState.originalContent);
      expect(result).toBe(diffState.originalContent);
    });

    it('should return original content when editor ref is null', () => {
      const editorRef = createNullEditorRef();

      const result = exitDiffView(editorRef, false, diffState);

      expect(result).toBe(diffState.originalContent);
    });
  });

  describe('exitDiffView_AppliesChangesWhenTrue', () => {
    it('should set markdown to current editor content when applying changes', () => {
      const userEditedContent = '# User Edited\n\nUser made these changes.';
      const editorRef = createMockEditorRef(userEditedContent);
      const diffState: DiffViewState = {
        isActive: true,
        originalContent: '# Original\n\nOriginal content.',
        proposedContent: '# Proposed\n\nProposed content.',
      };

      const result = exitDiffView(editorRef, true, diffState);

      expect(editorRef.current!.setMarkdown).toHaveBeenCalledWith(userEditedContent);
      expect(result).toBe(userEditedContent);
    });

    it('should use empty string when getMarkdown returns empty', () => {
      const editorRef = createMockEditorRef('');
      const diffState: DiffViewState = {
        isActive: true,
        originalContent: '# Original',
        proposedContent: '# Proposed',
      };

      const result = exitDiffView(editorRef, true, diffState);

      expect(editorRef.current!.setMarkdown).toHaveBeenCalledWith('');
      expect(result).toBe('');
    });
  });

  describe('getProposedContent_ReturnsEditedContent', () => {
    it('should return current markdown from editor', () => {
      const expectedContent = '# Edited Content\n\nUser modifications here.';
      const editorRef = createMockEditorRef(expectedContent);

      const result = getProposedContent(editorRef);

      expect(result).toBe(expectedContent);
      expect(editorRef.current!.getMarkdown).toHaveBeenCalled();
    });

    it('should return null when editor ref is null', () => {
      const editorRef = createNullEditorRef();

      const result = getProposedContent(editorRef);

      expect(result).toBeNull();
    });

    it('should return empty string when editor has no content', () => {
      const editorRef = createMockEditorRef('');

      const result = getProposedContent(editorRef);

      expect(result).toBe('');
    });
  });

  describe('createUnifiedDiff_GeneratesDiff', () => {
    it('should generate unified diff for changed content', () => {
      const original = 'Line 1\nLine 2\nLine 3';
      const modified = 'Line 1\nLine 2 Modified\nLine 3';

      const diff = createUnifiedDiff(original, modified);

      expect(diff).toContain('---');
      expect(diff).toContain('+++');
      expect(diff).toContain('-Line 2');
      expect(diff).toContain('+Line 2 Modified');
    });

    it('should include file names in diff header', () => {
      const original = 'content';
      const modified = 'modified content';

      const diff = createUnifiedDiff(original, modified, {
        originalFileName: 'spec.md',
        modifiedFileName: 'spec-modified.md',
      });

      expect(diff).toContain('spec.md');
      expect(diff).toContain('spec-modified.md');
    });

    it('should use default file names when not specified', () => {
      const original = 'original';
      const modified = 'modified';

      const diff = createUnifiedDiff(original, modified);

      expect(diff).toContain('original');
      expect(diff).toContain('modified');
    });

    it('should respect context lines option', () => {
      const original = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10';
      const modified = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5 Changed\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10';

      const diffWith1Context = createUnifiedDiff(original, modified, { contextLines: 1 });
      const diffWith5Context = createUnifiedDiff(original, modified, { contextLines: 5 });

      // More context lines = longer diff
      expect(diffWith5Context.length).toBeGreaterThan(diffWith1Context.length);
    });

    it('should return empty diff body when content is identical', () => {
      const content = 'Same content\nNo changes';

      const diff = createUnifiedDiff(content, content);

      // Should still have headers but no change markers
      expect(diff).not.toContain('-Same content');
      expect(diff).not.toContain('+Same content');
    });
  });

  describe('createInitialDiffState', () => {
    it('should return inactive state with empty content', () => {
      const state = createInitialDiffState();

      expect(state.isActive).toBe(false);
      expect(state.originalContent).toBe('');
      expect(state.proposedContent).toBe('');
      expect(state.location).toBeUndefined();
    });
  });

  describe('hasDifferences', () => {
    it('should return true when content differs', () => {
      expect(hasDifferences('original', 'modified')).toBe(true);
    });

    it('should return false when content is identical', () => {
      expect(hasDifferences('same', 'same')).toBe(false);
    });

    it('should detect whitespace differences', () => {
      expect(hasDifferences('content', 'content ')).toBe(true);
      expect(hasDifferences('line1\nline2', 'line1\n\nline2')).toBe(true);
    });
  });

  describe('countDiffChanges', () => {
    it('should count added and removed lines', () => {
      const diff = `--- original
+++ modified
@@ -1,3 +1,4 @@
 Line 1
-Line 2
+Line 2 Modified
+Line 2.5 Added
 Line 3`;

      const counts = countDiffChanges(diff);

      expect(counts.added).toBe(2);
      expect(counts.removed).toBe(1);
    });

    it('should not count header lines as changes', () => {
      const diff = `--- a/file.md
+++ b/file.md
@@ -1 +1 @@
-old
+new`;

      const counts = countDiffChanges(diff);

      // Should not count --- and +++ as removed/added
      expect(counts.added).toBe(1);
      expect(counts.removed).toBe(1);
    });

    it('should return zero counts for identical content', () => {
      const diff = `--- original
+++ modified`;

      const counts = countDiffChanges(diff);

      expect(counts.added).toBe(0);
      expect(counts.removed).toBe(0);
    });
  });
});
