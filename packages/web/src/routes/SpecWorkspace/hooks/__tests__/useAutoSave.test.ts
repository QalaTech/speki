import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not save when there are no unsaved changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    renderHook(() =>
      useAutoSave({
        content: 'test content',
        hasUnsavedChanges: false,
        onSave,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    
    expect(onSave).not.toHaveBeenCalled();
  });

  it('should auto-save after debounce period', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    renderHook(() =>
      useAutoSave({
        content: 'test content',
        hasUnsavedChanges: true,
        onSave,
        debounceMs: 2000,
      })
    );

    // Should not save immediately
    expect(onSave).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  it('should reset timer when content changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    const { rerender } = renderHook(
      ({ content }) =>
        useAutoSave({
          content,
          hasUnsavedChanges: true,
          onSave,
          debounceMs: 2000,
        }),
      { initialProps: { content: 'initial' } }
    );

    // Advance partially
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Change content
    rerender({ content: 'changed' });

    // Advance to original timer (should not trigger)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Advance to new timer
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  it('should update lastSavedAt after successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    const { result } = renderHook(() =>
      useAutoSave({
        content: 'test',
        hasUnsavedChanges: true,
        onSave,
        debounceMs: 1000,
      })
    );

    expect(result.current.lastSavedAt).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    
    await waitFor(() => {
      expect(result.current.lastSavedAt).not.toBeNull();
    });
    
    expect(result.current.lastSavedAt instanceof Date).toBe(true);
  });

  it('should allow manual trigger save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    const { result } = renderHook(() =>
      useAutoSave({
        content: 'test',
        hasUnsavedChanges: true,
        onSave,
        debounceMs: 5000,
      })
    );

    // Trigger manual save
    await act(async () => {
      await result.current.triggerSave();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('should not trigger manual save when no unsaved changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    const { result } = renderHook(() =>
      useAutoSave({
        content: 'test',
        hasUnsavedChanges: false,
        onSave,
      })
    );

    await act(async () => {
      await result.current.triggerSave();
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('should provide formatted last saved time', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    
    const { result } = renderHook(() =>
      useAutoSave({
        content: 'test',
        hasUnsavedChanges: true,
        onSave,
        debounceMs: 1000,
      })
    );

    expect(result.current.formattedLastSaved).toBe('');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    
    await waitFor(() => {
      expect(result.current.formattedLastSaved).not.toBe('');
    });
  });
});
