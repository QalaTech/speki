import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from '../useDocumentTitle';

describe('useDocumentTitle', () => {
  it('should extract title from H1 in content', () => {
    const content = '# My Great Spec\n\nSome content here';
    const { result } = renderHook(() =>
      useDocumentTitle({ content, filename: 'ignored.prd.md' })
    );
    
    expect(result.current).toBe('My Great Spec');
  });

  it('should fall back to filename when no H1', () => {
    const content = '## Subheading only\n\nNo H1 here';
    const { result } = renderHook(() =>
      useDocumentTitle({ content, filename: 'fallback-name.prd.md' })
    );
    
    expect(result.current).toBe('Fallback Name');
  });

  it('should memoize the result', () => {
    const content = '# Title';
    const { result, rerender } = renderHook(
      ({ content: c }) => useDocumentTitle({ content: c, filename: 'file.prd.md' }),
      { initialProps: { content } }
    );

    const firstResult = result.current;
    
    // Re-render with same content
    rerender({ content });
    
    // Should be same reference (memoized)
    expect(result.current).toBe(firstResult);
  });

  it('should update when content changes', () => {
    const { result, rerender } = renderHook(
      ({ content }) => useDocumentTitle({ content, filename: 'file.prd.md' }),
      { initialProps: { content: '# First Title' } }
    );

    expect(result.current).toBe('First Title');

    rerender({ content: '# Second Title' });

    expect(result.current).toBe('Second Title');
  });
});
