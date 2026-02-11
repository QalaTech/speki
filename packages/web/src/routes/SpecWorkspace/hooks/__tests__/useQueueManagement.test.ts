import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQueueManagement } from '../useQueueManagement';
import { apiFetch } from '../../../../components/ui/ErrorContext';

vi.mock('../../../../components/ui/ErrorContext', () => ({
  apiFetch: vi.fn(),
}));

describe('useQueueManagement', () => {
  const defaultProps = {
    specId: 'spec-1',
    projectPath: '/test/project',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty queue', () => {
    const { result } = renderHook(() => useQueueManagement(defaultProps));
    
    expect(result.current.queueTasks).toEqual([]);
    expect(result.current.allQueueTasks).toEqual([]);
    expect(result.current.queueLoading).toEqual(new Set());
    expect(result.current.completedIds).toEqual(new Set());
  });

  describe('loadQueueTasks', () => {
    it('should load queue tasks successfully', async () => {
      const mockQueue = [
        { specId: 'spec-1', taskId: 'task-1', status: 'queued', queuedAt: '2024-01-01' },
        { specId: 'spec-1', taskId: 'task-2', status: 'completed', queuedAt: '2024-01-01' },
        { specId: 'spec-2', taskId: 'task-3', status: 'queued', queuedAt: '2024-01-01' },
      ];
      
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ queue: mockQueue }),
      } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/queue/with-tasks?project=%2Ftest%2Fproject'
      );
      
      // Should filter tasks for current spec
      expect(result.current.queueTasks).toHaveLength(2);
      expect(result.current.queueTasks[0].taskId).toBe('task-1');
      expect(result.current.queueTasks[1].taskId).toBe('task-2');
      
      // Should have all tasks
      expect(result.current.allQueueTasks).toHaveLength(3);
      
      // Should extract completed IDs
      expect(result.current.completedIds).toEqual(new Set(['task-2']));
    });

    it('should not load when specId is not provided', async () => {
      const { result } = renderHook(() =>
        useQueueManagement({ ...defaultProps, specId: '' })
      );

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(apiFetch).not.toHaveBeenCalled();
    });

    it('should handle empty queue response', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ queue: [] }),
      } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(result.current.queueTasks).toEqual([]);
      expect(result.current.completedIds).toEqual(new Set());
    });

    it('should handle API error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiFetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(result.current.queueTasks).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('should handle network error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(result.current.queueTasks).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load queue tasks:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('addToQueue', () => {
    it('should add task to queue successfully', async () => {
      const mockQueue: { specId: string; taskId: string; status: string }[] = [];
      const updatedQueue = [{ specId: 'spec-1', taskId: 'task-1', status: 'queued' }];
      
      vi.mocked(apiFetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: mockQueue }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: updatedQueue }),
        } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      // Load initial state
      await act(async () => {
        await result.current.loadQueueTasks();
      });

      await act(async () => {
        await result.current.addToQueue('task-1');
      });

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/queue/add?project=%2Ftest%2Fproject',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specId: 'spec-1', taskId: 'task-1' }),
        })
      );
    });

    it('should set loading state during add', async () => {
      let resolveRequest: (value: unknown) => void;
      const requestPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });
      
      vi.mocked(apiFetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: [] }),
        } as unknown as Response)
        .mockReturnValueOnce(requestPromise as Promise<Response>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: [] }),
        } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      act(() => {
        result.current.addToQueue('task-1');
      });

      expect(result.current.queueLoading.has('task-1')).toBe(true);

      resolveRequest!({ ok: true });
      
      await waitFor(() => {
        expect(result.current.queueLoading.has('task-1')).toBe(false);
      });
    });

    it('should not add when specId is not provided', async () => {
      const { result } = renderHook(() =>
        useQueueManagement({ ...defaultProps, specId: '' })
      );

      await act(async () => {
        await result.current.addToQueue('task-1');
      });

      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  describe('removeFromQueue', () => {
    it('should remove task from queue successfully', async () => {
      vi.mocked(apiFetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: [] }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: [] }),
        } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      await act(async () => {
        await result.current.removeFromQueue('task-1');
      });

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/queue/spec-1/task-1?project=%2Ftest%2Fproject',
        { method: 'DELETE' }
      );
    });

    it('should set loading state during remove', async () => {
      let resolveRequest: (value: unknown) => void;
      const requestPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });
      
      vi.mocked(apiFetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: [] }),
        } as unknown as Response)
        .mockReturnValueOnce(requestPromise as Promise<Response>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ queue: [] }),
        } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      act(() => {
        result.current.removeFromQueue('task-1');
      });

      expect(result.current.queueLoading.has('task-1')).toBe(true);

      resolveRequest!({ ok: true });
      
      await waitFor(() => {
        expect(result.current.queueLoading.has('task-1')).toBe(false);
      });
    });

    it('should not remove when specId is not provided', async () => {
      const { result } = renderHook(() =>
        useQueueManagement({ ...defaultProps, specId: '' })
      );

      await act(async () => {
        await result.current.removeFromQueue('task-1');
      });

      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  describe('utility functions', () => {
    it('should check if task is queued', async () => {
      const mockQueue = [
        { specId: 'spec-1', taskId: 'task-1', status: 'queued', queuedAt: '2024-01-01' },
      ];
      
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ queue: mockQueue }),
      } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(result.current.isTaskQueued('task-1')).toBe(true);
      expect(result.current.isTaskQueued('task-2')).toBe(false);
    });

    it('should get queue position', async () => {
      const mockQueue = [
        { specId: 'spec-1', taskId: 'task-1', status: 'queued', queuedAt: '2024-01-01' },
        { specId: 'spec-1', taskId: 'task-2', status: 'queued', queuedAt: '2024-01-01' },
        { specId: 'spec-1', taskId: 'task-3', status: 'completed', queuedAt: '2024-01-01' },
      ];
      
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ queue: mockQueue }),
      } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(result.current.getQueuePosition('task-1')).toBe(1);
      expect(result.current.getQueuePosition('task-2')).toBe(2);
      expect(result.current.getQueuePosition('task-3')).toBeNull(); // completed
      expect(result.current.getQueuePosition('task-4')).toBeNull(); // not in queue
    });

    it('should get queued task status', async () => {
      const mockQueue = [
        { specId: 'spec-1', taskId: 'task-1', status: 'queued', queuedAt: '2024-01-01' },
        { specId: 'spec-1', taskId: 'task-2', status: 'running', queuedAt: '2024-01-01' },
      ];
      
      vi.mocked(apiFetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ queue: mockQueue }),
      } as unknown as Response);

      const { result } = renderHook(() => useQueueManagement(defaultProps));

      await act(async () => {
        await result.current.loadQueueTasks();
      });

      expect(result.current.getQueuedTaskStatus('task-1')).toBe('queued');
      expect(result.current.getQueuedTaskStatus('task-2')).toBe('running');
      expect(result.current.getQueuedTaskStatus('task-3')).toBe('queued'); // default
    });
  });

  describe('setters', () => {
    it('should allow manual queue tasks update', () => {
      const { result } = renderHook(() => useQueueManagement(defaultProps));

      act(() => {
        result.current.setQueueTasks([
          { specId: 'spec-1', taskId: 'task-1', status: 'queued', queuedAt: '2024-01-01' },
        ]);
      });

      expect(result.current.queueTasks).toHaveLength(1);
    });

    it('should allow manual completed IDs update', () => {
      const { result } = renderHook(() => useQueueManagement(defaultProps));

      act(() => {
        result.current.setCompletedIds(new Set(['task-1', 'task-2']));
      });

      expect(result.current.completedIds).toEqual(new Set(['task-1', 'task-2']));
    });
  });
});
