import { useCallback, useRef, useState } from 'react';
import type { LexicalEditor } from 'lexical';
import type { SpecEditorRef } from '../components/shared/SpecEditor.js';
import {
  scrollToSection,
  scrollToLine,
  highlightText,
  getSelectedText,
  type HighlightOptions,
} from '../lib/mdx-editor/lexical-utils.js';
import {
  createInitialDiffState,
  type DiffViewState,
  type DiffLocation,
} from '../lib/mdx-editor/diff-utils.js';

/**
 * State managed by the useSpecEditor hook.
 */
export interface SpecEditorState {
  /** Current markdown content */
  content: string;
  /** Whether the editor content has been modified */
  isDirty: boolean;
  /** Current diff view state */
  diffState: DiffViewState;
  /** Currently selected text in the editor */
  selectedText: string;
}

/**
 * Actions provided by the useSpecEditor hook.
 */
export interface SpecEditorActions {
  /** Updates the content and marks as dirty */
  setContent: (content: string) => void;
  /** Marks content as clean (e.g., after save) */
  markClean: () => void;
  /** Gets the currently selected text in the editor */
  getSelection: () => string;
  /** Updates the tracked selected text (call this on selection change events) */
  updateSelection: () => void;
  /** Clears the tracked selected text */
  clearSelection: () => void;
  /** Scrolls to a section by heading text */
  scrollToHeading: (heading: string) => boolean;
  /** Scrolls to a specific line number */
  scrollToLineNumber: (lineNumber: number) => boolean;
  /** Highlights text in the editor with optional fade */
  highlight: (
    text: string,
    duration?: number,
    options?: HighlightOptions
  ) => (() => void) | null;
  /** Enters diff mode showing comparison between original and proposed content */
  enterDiffMode: (original: string, proposed: string, location?: DiffLocation) => void;
  /** Updates the diff state content (used by Monaco diff when hunks are accepted/rejected) */
  updateDiffContent: (original: string, proposed: string) => void;
  /** Exits diff mode, optionally applying changes */
  exitDiffMode: (applyChanges: boolean) => string;
  /** Gets the current proposed content in diff mode */
  getDiffProposedContent: () => string | null;
}

/**
 * Return type of the useSpecEditor hook.
 */
export type UseSpecEditorReturn = SpecEditorState &
  SpecEditorActions & {
    /** Ref to attach to the SpecEditor component */
    editorRef: React.RefObject<SpecEditorRef>;
  };

const initialState: SpecEditorState = {
  content: '',
  isDirty: false,
  diffState: createInitialDiffState(),
  selectedText: '',
};

/**
 * Hook that manages MDXEditor state including content, selection, and editor ref
 * for programmatic control. Provides utilities for scrolling, highlighting,
 * and entering/exiting diff mode.
 */
export function useSpecEditor(initialContent: string = ''): UseSpecEditorReturn {
  const editorRef = useRef<SpecEditorRef>(null) as React.RefObject<SpecEditorRef>;
  const [state, setState] = useState<SpecEditorState>({
    ...initialState,
    content: initialContent,
  });

  const setContent = useCallback((content: string): void => {
    setState((prev) => ({
      ...prev,
      content,
      isDirty: true,
    }));
    editorRef.current?.setMarkdown(content);
  }, []);

  const markClean = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      isDirty: false,
    }));
  }, []);

  const getSelection = useCallback((): string => {
    const lexicalEditor = getLexicalEditorFromRef(editorRef);
    return lexicalEditor ? getSelectedText(lexicalEditor) : '';
  }, []);

  const updateSelection = useCallback((): void => {
    const lexicalEditor = getLexicalEditorFromRef(editorRef);
    const text = lexicalEditor ? getSelectedText(lexicalEditor) : '';
    setState((prev) => {
      // Only update if selection actually changed
      if (prev.selectedText === text) return prev;
      return { ...prev, selectedText: text };
    });
  }, []);

  const clearSelection = useCallback((): void => {
    setState((prev) => {
      if (prev.selectedText === '') return prev;
      return { ...prev, selectedText: '' };
    });
  }, []);

  const scrollToHeading = useCallback((heading: string): boolean => {
    const lexicalEditor = getLexicalEditorFromRef(editorRef);
    return lexicalEditor ? scrollToSection(lexicalEditor, heading) : false;
  }, []);

  const scrollToLineNumber = useCallback((lineNumber: number): boolean => {
    const lexicalEditor = getLexicalEditorFromRef(editorRef);
    return lexicalEditor ? scrollToLine(lexicalEditor, lineNumber) : false;
  }, []);

  const highlight = useCallback(
    (
      text: string,
      duration: number = 2000,
      options?: HighlightOptions
    ): (() => void) | null => {
      const lexicalEditor = getLexicalEditorFromRef(editorRef);
      return lexicalEditor ? highlightText(lexicalEditor, text, duration, options) : null;
    },
    []
  );

  const enterDiffMode = useCallback(
    (original: string, proposed: string, _location?: DiffLocation): void => {
      // Just update state - the SpecEditor component will handle the view mode change
      // via its key prop, which forces a clean remount with the correct content
      setState((prev) => ({
        ...prev,
        content: proposed,
        diffState: {
          isActive: true,
          originalContent: original,
          proposedContent: proposed,
          location: _location,
        },
      }));
    },
    []
  );

  const updateDiffContent = useCallback(
    (original: string, proposed: string): void => {
      setState((prev) => {
        if (!prev.diffState.isActive) return prev;
        return {
          ...prev,
          content: original, // Main content reflects the current original (as modified by accepted hunks)
          diffState: {
            ...prev.diffState,
            originalContent: original,
            proposedContent: proposed,
          },
        };
      });
    },
    []
  );

  const exitDiffModeAction = useCallback(
    (applyChanges: boolean): string => {
      // Determine final content based on whether changes are applied
      const finalContent = applyChanges
        ? state.diffState.proposedContent
        : state.diffState.originalContent;

      setState((prev) => ({
        ...prev,
        content: finalContent,
        isDirty: applyChanges || prev.isDirty,
        diffState: createInitialDiffState(),
      }));

      return finalContent;
    },
    [state.diffState]
  );

  const getDiffProposedContent = useCallback((): string | null => {
    if (!state.diffState.isActive) {
      return null;
    }
    // Return current content (which is the proposed content, possibly edited by user)
    return state.content;
  }, [state.diffState.isActive, state.content]);

  return {
    ...state,
    editorRef,
    setContent,
    markClean,
    getSelection,
    updateSelection,
    clearSelection,
    scrollToHeading,
    scrollToLineNumber,
    highlight,
    enterDiffMode,
    updateDiffContent,
    exitDiffMode: exitDiffModeAction,
    getDiffProposedContent,
  };
}

/**
 * Helper to get LexicalEditor from MDXEditorMethods.
 * MDXEditor internally uses Lexical, this accesses it for advanced operations.
 */
function getLexicalEditor(
  editorMethods: ReturnType<SpecEditorRef['getEditorMethods']>
): LexicalEditor | null {
  if (!editorMethods) {
    return null;
  }

  // MDXEditor's internal structure - accessing lexical editor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyMethods = editorMethods as any;
  return anyMethods._lexicalEditor ?? anyMethods.lexicalEditor ?? null;
}

/**
 * Helper to get LexicalEditor from SpecEditorRef.
 */
function getLexicalEditorFromRef(
  ref: React.RefObject<SpecEditorRef>
): LexicalEditor | null {
  const editorMethods = ref.current?.getEditorMethods();
  return getLexicalEditor(editorMethods);
}
