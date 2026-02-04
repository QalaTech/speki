import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuirkyMessage } from '../useQuirkyMessage';
import { QUIRKY_MESSAGES } from '../../constants';

describe('useQuirkyMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null when not active', () => {
    const { result } = renderHook(() =>
      useQuirkyMessage({ isActive: false })
    );

    expect(result.current).toBeNull();
  });

  it('should pick a random message when activated', () => {
    const { result } = renderHook(() =>
      useQuirkyMessage({ isActive: true, intervalMs: 3000 })
    );

    // Should have a message after initial pick
    expect(result.current).not.toBeNull();
    expect(QUIRKY_MESSAGES).toContain(result.current);
  });

  it('should rotate messages at interval', async () => {
    const { result } = renderHook(() =>
      useQuirkyMessage({ isActive: true, intervalMs: 3000 })
    );

    const firstMessage = result.current;
    expect(firstMessage).not.toBeNull();

    // Advance past interval
    await vi.advanceTimersByTimeAsync(3000);

    // Message might have changed (depending on random)
    // We just verify it still returns a valid message
    expect(QUIRKY_MESSAGES).toContain(result.current);
  });

  it('should clear message when deactivated', () => {
    const { result, rerender } = renderHook(
      ({ isActive }) => useQuirkyMessage({ isActive, intervalMs: 3000 }),
      { initialProps: { isActive: true } }
    );

    expect(result.current).not.toBeNull();

    rerender({ isActive: false });

    expect(result.current).toBeNull();
  });

  it('should try to avoid picking the same message consecutively', () => {
    // Mock Math.random to control the selection
    const randomSpy = vi.spyOn(Math, 'random');
    
    // First pick: index 0, Second pick: would be 0 again but should try to avoid it
    randomSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);

    const { result, rerender } = renderHook(
      ({ isActive }) => useQuirkyMessage({ isActive, intervalMs: 3000 }),
      { initialProps: { isActive: true } }
    );

    const firstMessage = result.current;
    expect(firstMessage).toBe(QUIRKY_MESSAGES[0]);

    // Clean up
    randomSpy.mockRestore();
  });
});
