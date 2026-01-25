import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@test/render';
import { useProjects } from '../queries';
import { mockProjects } from '@test/handlers';

describe('useProjects', () => {
  it('should fetch projects successfully', async () => {
    const { result } = renderHook(() => useProjects());

    // Initially loading
    expect(result.current.isPending).toBe(true);

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify data matches mock
    expect(result.current.data).toEqual(mockProjects);
    expect(result.current.data).toHaveLength(2);
  });

  it('should return project entries with expected structure', async () => {
    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const project = result.current.data?.[0];
    expect(project).toMatchObject({
      name: expect.any(String),
      path: expect.any(String),
      status: expect.any(String),
      lastActivity: expect.any(String),
    });
  });

  it('should have staleTime configured for SSE updates', async () => {
    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Data should not be stale immediately (5 minute staleTime)
    expect(result.current.isStale).toBe(false);
  });
});
