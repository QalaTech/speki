import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTextSelection } from '../useTextSelection';

describe('useTextSelection', () => {
  const mockContainer = {
    getBoundingClientRect: vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 300,
    }),
    contains: vi.fn().mockReturnValue(true),
  } as unknown as HTMLElement;

  const mockRange = {
    getBoundingClientRect: vi.fn().mockReturnValue({
      left: 100,
      top: 50,
      width: 80,
      height: 20,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (mockContainer.contains as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    
    // Mock window.getSelection
    Object.defineProperty(window, 'getSelection', {
      value: vi.fn(),
      writable: true,
    });
  });

  it('should start with null selection', () => {
    const { result } = renderHook(() =>
      useTextSelection({ containerRef: { current: mockContainer } })
    );

    expect(result.current.selection).toBeNull();
  });

  it('should set selection when text is selected', () => {
    const mockSelection = {
      toString: vi.fn().mockReturnValue('selected text'),
      getRangeAt: vi.fn().mockReturnValue(mockRange),
      removeAllRanges: vi.fn(),
    };

    (window.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(mockSelection);

    const { result } = renderHook(() =>
      useTextSelection({ containerRef: { current: mockContainer } })
    );

    act(() => {
      result.current.handleMouseUp();
    });

    expect(result.current.selection).toEqual({
      text: 'selected text',
      position: {
        x: 140, // 100 + 80/2 - 0
        y: 42,  // 50 - 0 - 8
      },
    });
  });

  it('should not set selection when text is empty', () => {
    const mockSelection = {
      toString: vi.fn().mockReturnValue('   '),
      getRangeAt: vi.fn(),
      removeAllRanges: vi.fn(),
    };

    (window.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(mockSelection);

    const { result } = renderHook(() =>
      useTextSelection({ containerRef: { current: mockContainer } })
    );

    act(() => {
      result.current.handleMouseUp();
    });

    expect(result.current.selection).toBeNull();
  });

  it('should clear selection when clearSelection is called', () => {
    const mockSelection = {
      toString: vi.fn().mockReturnValue('selected text'),
      getRangeAt: vi.fn().mockReturnValue(mockRange),
      removeAllRanges: vi.fn(),
    };

    (window.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(mockSelection);

    const { result } = renderHook(() =>
      useTextSelection({ containerRef: { current: mockContainer } })
    );

    act(() => {
      result.current.handleMouseUp();
    });

    expect(result.current.selection).not.toBeNull();

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selection).toBeNull();
    expect(mockSelection.removeAllRanges).toHaveBeenCalled();
  });

  it('should handle null container ref', () => {
    const mockSelection = {
      toString: vi.fn().mockReturnValue('selected text'),
      getRangeAt: vi.fn().mockReturnValue(mockRange),
      removeAllRanges: vi.fn(),
    };

    (window.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(mockSelection);

    const { result } = renderHook(() =>
      useTextSelection({ containerRef: { current: null } })
    );

    act(() => {
      result.current.handleMouseUp();
    });

    expect(result.current.selection).toBeNull();
  });

  it('should clear selection when clicking outside container', () => {
    const mockSelection = {
      toString: vi.fn().mockReturnValue('selected text'),
      getRangeAt: vi.fn().mockReturnValue(mockRange),
      removeAllRanges: vi.fn(),
      isCollapsed: false,
      rangeCount: 1,
    };

    (window.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(mockSelection);
    (mockContainer.contains as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { result } = renderHook(() =>
      useTextSelection({ containerRef: { current: mockContainer } })
    );

    act(() => {
      result.current.handleMouseUp();
    });
    expect(result.current.selection).not.toBeNull();

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(result.current.selection).toBeNull();
    expect(mockSelection.removeAllRanges).toHaveBeenCalled();
  });
});
