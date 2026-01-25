import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@test/render';
import { useStartRalph, useStopRalph } from '../mutations';

describe('useStartRalph', () => {
  it('should start Ralph successfully', async () => {
    const { result } = renderHook(() => useStartRalph());

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.mutate({ project: '/test/project' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it('should track mutation state transitions', async () => {
    const { result } = renderHook(() => useStartRalph());

    // Initially idle
    expect(result.current.isIdle).toBe(true);

    act(() => {
      result.current.mutate({ project: '/test/project' });
    });

    // Eventually succeeds
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe('useStopRalph', () => {
  it('should stop Ralph successfully', async () => {
    const { result } = renderHook(() => useStopRalph());

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.mutate({ project: '/test/project' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });
});
