import { useCallback } from 'react';

/**
 * Hook to scroll to an element by ID
 */
export function useScrollToElement() {
  return useCallback((elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);
}
