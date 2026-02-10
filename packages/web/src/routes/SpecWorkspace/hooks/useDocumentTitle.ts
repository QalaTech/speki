import { useMemo } from 'react';
import { extractDocumentTitle } from '../utils';

interface UseDocumentTitleOptions {
  filename: string;
}

/**
 * Hook to extract and format the document title from content or filename
 */
export function useDocumentTitle({ filename }: UseDocumentTitleOptions): string {
  return useMemo(() => {
    return extractDocumentTitle(filename);
  }, [filename]);
}
