import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpecEditor } from '../useSpecEditor';
import type { SpecEditorRef } from '../../components/SpecEditor';
import type { LexicalEditor } from 'lexical';

// Mock the lexical-utils module
vi.mock('../../lib/mdx-editor/lexical-utils', () => ({
  scrollToSection: vi.fn(() => true),
  scrollToLine: vi.fn(() => true),
  highlightText: vi.fn(() => () => {}),
  getSelectedText: vi.fn(() => 'selected text'),
}));

// Mock the diff-utils module
vi.mock('../../lib/mdx-editor/diff-utils', () => ({
  showDiff: vi.fn((ref, original, proposed, location) => ({
    isActive: true,
    originalContent: original,
    proposedContent: proposed,
    location,
  })),
  exitDiffView: vi.fn((ref, applyChanges, diffState) =>
    applyChanges ? diffState.proposedContent : diffState.originalContent
  ),
  getProposedContent: vi.fn(() => 'proposed content'),
  createInitialDiffState: vi.fn(() => ({
    isActive: false,
    originalContent: '',
    proposedContent: '',
  })),
}));

// Import mocked modules for assertions
import * as lexicalUtils from '../../lib/mdx-editor/lexical-utils';
import * as diffUtils from '../../lib/mdx-editor/diff-utils';

/**
 * Creates a mock SpecEditorRef for testing.
 */
function createMockEditorRef(): SpecEditorRef {
  const mockLexicalEditor = {} as LexicalEditor;

  return {
    getMarkdown: vi.fn(() => '# Test Content'),
    setMarkdown: vi.fn(),
    focus: vi.fn(),
    insertMarkdown: vi.fn(),
    getEditorMethods: vi.fn(() => ({
      _lexicalEditor: mockLexicalEditor,
    })),
  };
}

describe('useSpecEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useSpecEditor_ProvidesRef', () => {
    it('should provide an editor ref object', () => {
      const { result } = renderHook(() => useSpecEditor());
      expect(result.current.editorRef).toBeDefined();
      expect(result.current.editorRef.current).toBeNull();
    });

    it('should have ref with correct type signature', () => {
      const { result } = renderHook(() => useSpecEditor());
      expect('current' in result.current.editorRef).toBe(true);
    });

    it('should allow ref to be attached to editor', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      // Simulate attaching ref (in real usage, React does this)
      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      expect(result.current.editorRef.current).toBe(mockEditor);
    });
  });

  describe('useSpecEditor_TracksContent', () => {
    it('should initialize with empty content by default', () => {
      const { result } = renderHook(() => useSpecEditor());
      expect(result.current.content).toBe('');
    });

    it('should initialize with provided content', () => {
      const { result } = renderHook(() =>
        useSpecEditor('# Initial Content')
      );
      expect(result.current.content).toBe('# Initial Content');
    });

    it('should update content via setContent', () => {
      const { result } = renderHook(() => useSpecEditor());

      act(() => {
        result.current.setContent('# New Content');
      });

      expect(result.current.content).toBe('# New Content');
    });

    it('should mark as dirty when content changes', () => {
      const { result } = renderHook(() => useSpecEditor());

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setContent('# Changed');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should mark as clean via markClean', () => {
      const { result } = renderHook(() => useSpecEditor());

      act(() => {
        result.current.setContent('# Changed');
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.markClean();
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should not call setMarkdown on editor when content is set', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      act(() => {
        result.current.setContent('# Updated');
      });

      expect(mockEditor.setMarkdown).not.toHaveBeenCalled();
    });
  });

  describe('useSpecEditor_ProvidesSelection', () => {
    it('should provide getSelection function', () => {
      const { result } = renderHook(() => useSpecEditor());
      expect(typeof result.current.getSelection).toBe('function');
    });

    it('should return empty string when ref is not attached', () => {
      const { result } = renderHook(() => useSpecEditor());
      const selection = result.current.getSelection();
      expect(selection).toBe('');
    });

    it('should call getSelectedText when ref is attached', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      const selection = result.current.getSelection();

      expect(lexicalUtils.getSelectedText).toHaveBeenCalled();
      expect(selection).toBe('selected text');
    });

    it('should initialize with empty selectedText', () => {
      const { result } = renderHook(() => useSpecEditor());
      expect(result.current.selectedText).toBe('');
    });

    it('should update selectedText via updateSelection', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      act(() => {
        result.current.updateSelection();
      });

      expect(result.current.selectedText).toBe('selected text');
    });

    it('should clear selectedText via clearSelection', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      // First set a selection
      act(() => {
        result.current.updateSelection();
      });
      expect(result.current.selectedText).toBe('selected text');

      // Then clear it
      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.selectedText).toBe('');
    });

    it('should not re-render if selection has not changed', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      // Update selection
      act(() => {
        result.current.updateSelection();
      });
      const firstSelectedText = result.current.selectedText;

      // Update again with same value
      act(() => {
        result.current.updateSelection();
      });

      // Should still be the same reference (no unnecessary update)
      expect(result.current.selectedText).toBe(firstSelectedText);
    });
  });

  describe('useSpecEditor_ProvideDiffFunctions', () => {
    it('should provide enterDiffMode function', () => {
      const { result } = renderHook(() => useSpecEditor());
      expect(typeof result.current.enterDiffMode).toBe('function');
    });

    it('should provide exitDiffMode function', () => {
      const { result } = renderHook(() => useSpecEditor());
      expect(typeof result.current.exitDiffMode).toBe('function');
    });

    it('should enter diff mode with correct state', () => {
      const { result } = renderHook(() => useSpecEditor());

      act(() => {
        result.current.enterDiffMode('original', 'proposed');
      });

      expect(result.current.diffState.isActive).toBe(true);
      expect(result.current.diffState.originalContent).toBe('original');
      expect(result.current.diffState.proposedContent).toBe('proposed');
    });

    it('should exit diff mode and restore original when not applying', () => {
      const { result } = renderHook(() => useSpecEditor());

      act(() => {
        result.current.enterDiffMode('original content', 'proposed content');
      });

      let finalContent: string;
      act(() => {
        finalContent = result.current.exitDiffMode(false);
      });

      expect(finalContent!).toBe('original content');
      expect(result.current.diffState.isActive).toBe(false);
    });

    it('should exit diff mode and apply proposed when applying', () => {
      const { result } = renderHook(() => useSpecEditor());

      act(() => {
        result.current.enterDiffMode('original content', 'proposed content');
      });

      let finalContent: string;
      act(() => {
        finalContent = result.current.exitDiffMode(true);
      });

      expect(finalContent!).toBe('proposed content');
      expect(result.current.content).toBe('proposed content');
    });

    it('should mark as dirty when applying diff changes', () => {
      const { result } = renderHook(() => useSpecEditor());

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.enterDiffMode('original', 'proposed');
      });

      act(() => {
        result.current.exitDiffMode(true);
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should provide getDiffProposedContent when in diff mode', () => {
      const { result } = renderHook(() => useSpecEditor());

      const contentBefore = result.current.getDiffProposedContent();
      expect(contentBefore).toBeNull();

      act(() => {
        result.current.enterDiffMode('original', 'proposed content');
      });

      const contentAfter = result.current.getDiffProposedContent();
      expect(contentAfter).toBe('proposed content');
    });

    it('should provide scroll functions', () => {
      const { result } = renderHook(() => useSpecEditor());

      expect(typeof result.current.scrollToHeading).toBe('function');
      expect(typeof result.current.scrollToLineNumber).toBe('function');
    });

    it('should provide highlight function', () => {
      const { result } = renderHook(() => useSpecEditor());

      expect(typeof result.current.highlight).toBe('function');
    });

    it('should call scrollToSection with heading', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      const scrolled = result.current.scrollToHeading('## Requirements');

      expect(lexicalUtils.scrollToSection).toHaveBeenCalled();
      expect(scrolled).toBe(true);
    });

    it('should call highlightText with text and duration', () => {
      const { result } = renderHook(() => useSpecEditor());
      const mockEditor = createMockEditorRef();

      (result.current.editorRef as { current: SpecEditorRef | null }).current =
        mockEditor;

      const cleanup = result.current.highlight('sample text', 3000);

      expect(lexicalUtils.highlightText).toHaveBeenCalled();
      expect(typeof cleanup).toBe('function');
    });
  });
});
