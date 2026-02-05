import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDecompose } from '../useDecompose';
import { apiFetch } from '../../../../components/ui/ErrorContext';
import * as useDecomposeSSEModule from '../../../../hooks/useDecomposeSSE';

vi.mock('../../../../components/ui/ErrorContext', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../../../hooks/useDecomposeSSE', () => ({
  useDecomposeSSE: vi.fn(),
}));

describe('useDecompose', () => {
  const defaultProps = {
    projectPath: '/test/project',
    selectedPath: '/test/project/spec.prd.md',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue(null);
  });

  it('should initialize with empty stories and not decomposing', () => {
    const { result } = renderHook(() => useDecompose(defaultProps));
    
    expect(result.current.stories).toEqual([]);
    expect(result.current.isDecomposing).toBe(false);
  });

  describe('loadDecomposeState', () => {
    it('should load draft stories successfully', async () => {
      const mockDraft = {
        userStories: [
          { id: 'US-1', title: 'Story 1', description: 'Desc 1' },
          { id: 'US-2', title: 'Story 2', description: 'Desc 2' },
        ],
      };
      
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ draft: mockDraft }),
      } as unknown as Response);

      const { result } = renderHook(() => useDecompose(defaultProps));

      await act(async () => {
        await result.current.loadDecomposeState();
      });

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/decompose/draft?specPath=%2Ftest%2Fproject%2Fspec.prd.md&project=%2Ftest%2Fproject'
      );
      expect(result.current.stories).toHaveLength(2);
      expect(result.current.stories[0].id).toBe('US-1');
    });

    it('should handle empty draft response', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ draft: null }),
      } as unknown as Response);

      const { result } = renderHook(() => useDecompose(defaultProps));

      await act(async () => {
        await result.current.loadDecomposeState();
      });

      expect(result.current.stories).toEqual([]);
    });

    it('should not load when selectedPath is null', async () => {
      const { result } = renderHook(() =>
        useDecompose({ ...defaultProps, selectedPath: null })
      );

      await act(async () => {
        await result.current.loadDecomposeState();
      });

      expect(apiFetch).not.toHaveBeenCalled();
    });

    it('should handle API error gracefully', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      const { result } = renderHook(() => useDecompose(defaultProps));

      await act(async () => {
        await result.current.loadDecomposeState();
      });

      expect(result.current.stories).toEqual([]);
    });

    it('should handle network error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useDecompose(defaultProps));

      await act(async () => {
        await result.current.loadDecomposeState();
      });

      expect(result.current.stories).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load decompose state:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should clear stories while loading', async () => {
      const mockDraft = {
        userStories: [{ id: 'US-1', title: 'Story 1' }],
      };
      
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ draft: mockDraft }),
      } as unknown as Response);

      const { result } = renderHook(() => useDecompose(defaultProps));

      // First load some stories
      await act(async () => {
        await result.current.loadDecomposeState();
      });
      
      expect(result.current.stories).toHaveLength(1);

      // Trigger another load - should clear first
      let resolveSecond: (value: unknown) => void;
      const secondPromise = new Promise((resolve) => {
        resolveSecond = resolve;
      });
      
      vi.mocked(apiFetch).mockReturnValue(secondPromise as Promise<Response>);

      act(() => {
        result.current.loadDecomposeState();
      });

      // Stories should be cleared immediately
      expect(result.current.stories).toEqual([]);
      
      resolveSecond!({ ok: true, json: () => Promise.resolve({ draft: mockDraft }) });
    });
  });

  describe('handleDecompose', () => {
    it('should start decomposition successfully', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
      } as unknown as Response);

      const { result } = renderHook(() => useDecompose(defaultProps));

      await act(async () => {
        await result.current.handleDecompose();
      });

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/decompose/start?project=%2Ftest%2Fproject',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prdFile: '/test/project/spec.prd.md',
            forceRedecompose: false,
          }),
        })
      );
    });

    it('should support force redecompose', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
      } as unknown as Response);

      const { result } = renderHook(() => useDecompose(defaultProps));

      await act(async () => {
        await result.current.handleDecompose(true);
      });

      expect(apiFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            prdFile: '/test/project/spec.prd.md',
            forceRedecompose: true,
          }),
        })
      );
    });

    it('should not start when selectedPath is null', async () => {
      const { result } = renderHook(() =>
        useDecompose({ ...defaultProps, selectedPath: null })
      );

      await act(async () => {
        await result.current.handleDecompose();
      });

      expect(apiFetch).not.toHaveBeenCalled();
    });

    it('should set isDecomposing to true during decomposition', async () => {
      let resolveRequest: (value: unknown) => void;
      const requestPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });
      
      vi.mocked(apiFetch).mockReturnValue(requestPromise as Promise<Response>);

      const { result } = renderHook(() => useDecompose(defaultProps));

      act(() => {
        result.current.handleDecompose();
      });

      expect(result.current.isDecomposing).toBe(true);

      resolveRequest!({ ok: true });
    });

    it('should handle API error and reset isDecomposing', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useDecompose(defaultProps));

      await act(async () => {
        await result.current.handleDecompose();
      });

      expect(result.current.isDecomposing).toBe(false);
    });
  });

  describe('SSE updates', () => {
    it('should set isDecomposing true on active status', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'DECOMPOSING',
        message: 'Decomposing...',
        prdFile: '/test/project/spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(true);
    });

    it('should set isDecomposing false on complete status', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'COMPLETED',
        message: 'Done',
        prdFile: '/test/project/spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(false);
    });

    it('should reload state when decomposition completes', async () => {
      const mockDraft = {
        userStories: [{ id: 'US-1', title: 'Story 1' }],
      };
      
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ draft: mockDraft }),
      } as unknown as Response);

      const { result, rerender } = renderHook(() => useDecompose(defaultProps));

      // Simulate completion
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'COMPLETED',
        message: 'Done',
        prdFile: '/test/project/spec.prd.md',
      });

      rerender();

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/decompose/draft')
        );
      });
    });

    it('should ignore SSE updates for different spec', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'DECOMPOSING',
        message: 'Decomposing...',
        prdFile: '/test/project/other-spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(false);
    });

    it('should handle STARTING status as active', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'STARTING',
        message: 'Starting...',
        prdFile: '/test/project/spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(true);
    });

    it('should handle INITIALIZING status as active', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'INITIALIZING',
        message: 'Initializing...',
        prdFile: '/test/project/spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(true);
    });

    it('should handle REVIEWING status as active', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'REVIEWING',
        message: 'Reviewing...',
        prdFile: '/test/project/spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(true);
    });

    it('should handle REVISING status as active', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'REVISING',
        message: 'Revising...',
        prdFile: '/test/project/spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(true);
    });

    it('should handle DECOMPOSED status as complete', () => {
      vi.mocked(useDecomposeSSEModule.useDecomposeSSE).mockReturnValue({
        status: 'DECOMPOSED',
        message: 'Decomposed',
        prdFile: '/test/project/spec.prd.md',
      });

      const { result } = renderHook(() => useDecompose(defaultProps));

      expect(result.current.isDecomposing).toBe(false);
    });
  });

  describe('setters', () => {
    it('should allow manual story updates', () => {
      const { result } = renderHook(() => useDecompose(defaultProps));

      act(() => {
        result.current.setStories([
          { id: 'US-1', title: 'Manual Story', description: 'Test' } as any,
        ]);
      });

      expect(result.current.stories).toHaveLength(1);
      expect(result.current.stories[0].id).toBe('US-1');
    });

    it('should allow manual isDecomposing updates', () => {
      const { result } = renderHook(() => useDecompose(defaultProps));

      act(() => {
        result.current.setIsDecomposing(true);
      });

      expect(result.current.isDecomposing).toBe(true);
    });
  });
});
