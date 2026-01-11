import { useCallback, useRef, useState } from 'react';
import type { LexicalEditor } from 'lexical';
import type { SpecEditorRef } from '../components/SpecEditor.js';
import {
  scrollToSection,
  scrollToLine,
  highlightText,
  getSelectedText,
  type HighlightOptions,
} from '../lib/mdx-editor/lexical-utils.js';
import {
  showDiff,
  exitDiffView,
  getProposedContent,
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
    (original: string, proposed: string, location?: DiffLocation): void => {
      const newDiffState = showDiff(editorRef, original, proposed, location);
      setState((prev) => ({
        ...prev,
        diffState: newDiffState,
      }));
    },
    []
  );

  const exitDiffModeAction = useCallback(
    (applyChanges: boolean): string => {
      const finalContent = exitDiffView(
        editorRef,
        applyChanges,
        state.diffState
      );

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
    return getProposedContent(editorRef);
  }, [state.diffState.isActive]);

  return {
    ...state,
    editorRef,
    setContent,
    markClean,
    getSelection,
    scrollToHeading,
    scrollToLineNumber,
    highlight,
    enterDiffMode,
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
