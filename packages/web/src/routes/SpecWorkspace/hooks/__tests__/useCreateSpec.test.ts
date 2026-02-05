import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCreateSpec } from '../useCreateSpec';
import { apiFetch } from '../../../../components/ui/ErrorContext';

vi.mock('../../../../components/ui/ErrorContext', () => ({
  apiFetch: vi.fn(),
}));

describe('useCreateSpec', () => {
  const defaultProps = {
    projectPath: '/test/project',
    onSuccess: vi.fn(),
    refreshFiles: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with isCreating false', () => {
    const { result } = renderHook(() => useCreateSpec(defaultProps));
    
    expect(result.current.isCreating).toBe(false);
  });

  it('should create spec successfully', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ filePath: '/test/project/new-spec.prd.md' }),
    };
    vi.mocked(apiFetch).mockResolvedValue(mockResponse as unknown as Response);

    const onSuccess = vi.fn();
    const refreshFiles = vi.fn();
    
    const { result } = renderHook(() =>
      useCreateSpec({
        projectPath: '/test/project',
        onSuccess,
        refreshFiles,
      })
    );

    await act(async () => {
      await result.current.createSpec('new-spec', 'prd');
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/spec-review/new?project=%2Ftest%2Fproject',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'new-spec', type: 'prd' }),
      })
    );
    
    expect(refreshFiles).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('/test/project/new-spec.prd.md');
    expect(result.current.isCreating).toBe(false);
  });

  it('should not create spec with empty name', async () => {
    const { result } = renderHook(() => useCreateSpec(defaultProps));

    await act(async () => {
      await result.current.createSpec('   ', 'prd');
    });

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('should handle different spec types', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ filePath: '/test/project/spec.tech.md' }),
    };
    vi.mocked(apiFetch).mockResolvedValue(mockResponse as unknown as Response);

    const { result } = renderHook(() => useCreateSpec(defaultProps));

    await act(async () => {
      await result.current.createSpec('spec', 'tech-spec');
    });

    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ name: 'spec', type: 'tech-spec' }),
      })
    );
  });

  it('should handle bug spec type', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ filePath: '/test/project/bug.bug.md' }),
    };
    vi.mocked(apiFetch).mockResolvedValue(mockResponse as unknown as Response);

    const { result } = renderHook(() => useCreateSpec(defaultProps));

    await act(async () => {
      await result.current.createSpec('bug', 'bug');
    });

    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ name: 'bug', type: 'bug' }),
      })
    );
  });

  it('should set isCreating to true during creation', async () => {
    let resolveRequest: (value: unknown) => void;
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    
    vi.mocked(apiFetch).mockReturnValue(requestPromise as Promise<Response>);

    const { result } = renderHook(() => useCreateSpec(defaultProps));

    act(() => {
      result.current.createSpec('new-spec', 'prd');
    });

    expect(result.current.isCreating).toBe(true);

    resolveRequest!({ ok: true, json: () => Promise.resolve({ filePath: '/test' }) });
    
    await waitFor(() => {
      expect(result.current.isCreating).toBe(false);
    });
  });

  it('should handle API error gracefully', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
    };
    vi.mocked(apiFetch).mockResolvedValue(mockResponse as unknown as Response);

    const onSuccess = vi.fn();
    const refreshFiles = vi.fn();
    
    const { result } = renderHook(() =>
      useCreateSpec({
        projectPath: '/test/project',
        onSuccess,
        refreshFiles,
      })
    );

    await act(async () => {
      await result.current.createSpec('new-spec', 'prd');
    });

    expect(refreshFiles).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
  });

  it('should not create spec with whitespace-only name', async () => {
    const { result } = renderHook(() => useCreateSpec(defaultProps));

    await act(async () => {
      await result.current.createSpec('   ', 'prd');
    });

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
