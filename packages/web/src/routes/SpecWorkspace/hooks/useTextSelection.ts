import { useState, useCallback, type RefObject } from 'react';

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

  return {
    selection,
    clearSelection,
    handleMouseUp,
  };
}
