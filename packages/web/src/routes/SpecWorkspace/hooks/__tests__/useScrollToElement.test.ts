import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollToElement } from '../useScrollToElement';

describe('useScrollToElement', () => {
  it('should return a function', () => {
    const { result } = renderHook(() => useScrollToElement());
    expect(typeof result.current).toBe('function');
  });

  it('should scroll element into view when called', () => {
    const mockScrollIntoView = vi.fn();
    const mockElement = {
      scrollIntoView: mockScrollIntoView,
    } as unknown as HTMLElement;

    // Mock document.getElementById
    const getElementByIdSpy = vi.spyOn(document, 'getElementById');
    getElementByIdSpy.mockReturnValue(mockElement);

    const { result } = renderHook(() => useScrollToElement());

    result.current('test-element');

    expect(getElementByIdSpy).toHaveBeenCalledWith('test-element');
    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    getElementByIdSpy.mockRestore();
  });

  it('should do nothing when element is not found', () => {
    const getElementByIdSpy = vi.spyOn(document, 'getElementById');
    getElementByIdSpy.mockReturnValue(null);

    const { result } = renderHook(() => useScrollToElement());

    // Should not throw
    expect(() => result.current('non-existent')).not.toThrow();

    getElementByIdSpy.mockRestore();
  });
});
