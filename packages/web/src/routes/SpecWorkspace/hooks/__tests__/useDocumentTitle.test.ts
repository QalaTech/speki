import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from '../useDocumentTitle';

describe('useDocumentTitle', () => {
  it('should format filename as title', () => {
    const { result } = renderHook(() =>
      useDocumentTitle({ filename: 'my-great-spec.prd.md' })
    );
    
    expect(result.current).toBe('My Great Spec');
  });

  it('should memoize the result', () => {
    const { result, rerender } = renderHook(
      ({ filename }) => useDocumentTitle({ filename }),
      { initialProps: { filename: 'file.prd.md' } }
    );

    const firstResult = result.current;
    
    // Re-render with same filename
    rerender({ filename: 'file.prd.md' });
    
    // Should be same reference (memoized)
    expect(result.current).toBe(firstResult);
  });

  it('should update when filename changes', () => {
    const { result, rerender } = renderHook(
      ({ filename }) => useDocumentTitle({ filename }),
      { initialProps: { filename: 'first-title.prd.md' } }
    );

    expect(result.current).toBe('First Title');

    rerender({ filename: 'second-title.prd.md' });

    expect(result.current).toBe('Second Title');
  });
});
