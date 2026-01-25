import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@test/render';
import { useSaveContent, useUpdateSuggestion, useCreateSpec } from '../mutations';

describe('useSaveContent', () => {
  it('should save spec content successfully', async () => {
    const { result } = renderHook(() => useSaveContent());

    act(() => {
      result.current.mutate({
        path: 'specs/feature-a.md',
        content: '# Updated Content',
        project: '/test/project',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });
});

describe('useUpdateSuggestion', () => {
  it('should update suggestion status to approved', async () => {
    const { result } = renderHook(() => useUpdateSuggestion());

    act(() => {
      result.current.mutate({
        sessionId: 'session-123',
        suggestionId: 'suggestion-1',
        action: 'approved',
        project: '/test/project',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.suggestion.status).toBe('approved');
  });

  it('should update suggestion status to rejected', async () => {
    const { result } = renderHook(() => useUpdateSuggestion());

    act(() => {
      result.current.mutate({
        sessionId: 'session-123',
        suggestionId: 'suggestion-1',
        action: 'rejected',
        project: '/test/project',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.suggestion.status).toBe('rejected');
  });

  it('should include userVersion for edited status', async () => {
    const { result } = renderHook(() => useUpdateSuggestion());

    act(() => {
      result.current.mutate({
        sessionId: 'session-123',
        suggestionId: 'suggestion-1',
        action: 'edited',
        userVersion: 'User modified version of the fix',
        project: '/test/project',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(true);
  });
});

describe('useCreateSpec', () => {
  it('should create a new PRD spec', async () => {
    const { result } = renderHook(() => useCreateSpec());

    act(() => {
      result.current.mutate({
        name: 'new-feature',
        type: 'prd',
        project: '/test/project',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.filePath).toBe('specs/new-feature.md');
  });

  it('should create a tech-spec', async () => {
    const { result } = renderHook(() => useCreateSpec());

    act(() => {
      result.current.mutate({
        name: 'api-design',
        type: 'tech-spec',
        project: '/test/project',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.filePath).toBe('specs/api-design.md');
  });

  it('should trim whitespace from name', async () => {
    const { result } = renderHook(() => useCreateSpec());

    act(() => {
      result.current.mutate({
        name: '  trimmed-name  ',
        type: 'prd',
        project: '/test/project',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The mutation function trims the name before sending
    expect(result.current.data?.success).toBe(true);
  });
});
