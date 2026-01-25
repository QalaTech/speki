import { useState, useCallback, useRef, useEffect } from 'react';

interface UseResizablePanelOptions {
  /** Storage key for persisting width */
  storageKey: string;
  /** Default width if not stored */
  defaultWidth: number;
  /** Minimum allowed width */
  minWidth: number;
  /** Maximum allowed width */
  maxWidth: number;
}

interface UseResizablePanelReturn {
  width: number;
  handleResizeStart: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing a resizable panel with localStorage persistence.
 */
export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: UseResizablePanelOptions): UseResizablePanelReturn {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const isResizingRef = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Persist width to localStorage
        localStorage.setItem(storageKey, String(width));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [width, storageKey, minWidth, maxWidth]);

  return { width, handleResizeStart };
}
