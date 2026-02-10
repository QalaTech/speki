import { useState, useCallback, useEffect, type RefObject } from 'react';

export interface TextSelection {
  text: string;
  position: { x: number; y: number };
}

interface UseTextSelectionOptions {
  containerRef: RefObject<HTMLElement | null>;
}

interface UseTextSelectionReturn {
  selection: TextSelection | null;
  clearSelection: () => void;
  handleMouseUp: () => void;
}

/**
 * Hook to handle text selection within a container
 */
export function useTextSelection({ containerRef }: UseTextSelectionOptions): UseTextSelectionReturn {
  const [selection, setSelection] = useState<TextSelection | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleMouseUp = useCallback(() => {
    const windowSelection = window.getSelection();
    const selectedText = windowSelection?.toString().trim();

    if (!selectedText || selectedText.length === 0) {
      setSelection(null);
      return;
    }

    const range = windowSelection?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();

    if (!rect || !containerRef.current) {
      setSelection(null);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    setSelection({
      text: selectedText,
      position: {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
      },
    });
  }, [containerRef]);

  useEffect(() => {
    const handleOutsideMouseDown = (event: MouseEvent) => {
      if (!selection) return;

      const target = event.target as Node | null;
      if (!target) return;

      const isInsideContainer = containerRef.current?.contains(target) ?? false;
      const isInsidePopup =
        target instanceof HTMLElement &&
        Boolean(target.closest('[data-selection-popup]'));

      if (!isInsideContainer && !isInsidePopup) {
        clearSelection();
      }
    };

    const handleSelectionChange = () => {
      if (!selection) return;

      const currentSelection = window.getSelection();
      const selectedText = currentSelection?.toString().trim();

      if (!currentSelection || currentSelection.isCollapsed || !selectedText) {
        setSelection(null);
        return;
      }

      if (!containerRef.current || currentSelection.rangeCount === 0) {
        setSelection(null);
        return;
      }

      const range = currentSelection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        setSelection(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideMouseDown);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [containerRef, clearSelection, selection]);

  return {
    selection,
    clearSelection,
    handleMouseUp,
  };
}
