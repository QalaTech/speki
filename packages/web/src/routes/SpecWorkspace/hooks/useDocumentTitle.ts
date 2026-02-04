import { useMemo } from 'react';
import { extractDocumentTitle } from '../utils';

interface UseDocumentTitleOptions {
  content: string;
  filename: string;
}

/**
 * Hook to extract and format the document title from content or filename
 */
export function useDocumentTitle({ content, filename }: UseDocumentTitleOptions): string {
  return useMemo(() => {
    return extractDocumentTitle(content, filename);
  }, [content, filename]);
}
