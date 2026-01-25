import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@test/render';
import { useSpecTree, useSpecContent, useSpecSession, useGenerationStatus } from '../queries';
import { mockSpecTree, mockSpecContent, mockSession } from '@test/handlers';

describe('useSpecTree', () => {
  it('should fetch spec tree successfully', async () => {
    const { result } = renderHook(() => useSpecTree('/test/project'));

    expect(result.current.isPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe('specs');
    expect(result.current.data?.[0].type).toBe('folder');
  });

  it('should not fetch when project is null', () => {
    const { result } = renderHook(() => useSpecTree(null));

    // When enabled: false, fetchStatus is 'idle' and query has no data
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('should return nested folder structure', async () => {
    const { result } = renderHook(() => useSpecTree('/test/project'));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const specsFolder = result.current.data?.[0];
    expect(specsFolder?.children).toBeDefined();
    expect(specsFolder?.children).toHaveLength(3);

    // Check for nested subfolder
    const subfolder = specsFolder?.children?.find(c => c.name === 'subfolder');
    expect(subfolder?.type).toBe('folder');
    expect(subfolder?.children).toHaveLength(1);
  });

  it('should include review statuses in tree nodes', async () => {
    const { result } = renderHook(() => useSpecTree('/test/project'));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const specsFolder = result.current.data?.[0];
    const featureA = specsFolder?.children?.find(c => c.name === 'feature-a.md');
    expect(featureA?.reviewStatus).toBe('reviewed');

    const featureB = specsFolder?.children?.find(c => c.name === 'feature-b.md');
    expect(featureB?.reviewStatus).toBe('none');
  });
});

describe('useSpecContent', () => {
  it('should fetch spec content successfully', async () => {
    const { result } = renderHook(() =>
      useSpecContent('specs/feature-a.md', '/test/project')
    );

    expect(result.current.isPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe(mockSpecContent);
    expect(result.current.data).toContain('# Feature A');
  });

  it('should not fetch when path is null', () => {
    const { result } = renderHook(() =>
      useSpecContent(null, '/test/project')
    );

    // When enabled: false, fetchStatus is 'idle'
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('should not fetch when project is null', () => {
    const { result } = renderHook(() =>
      useSpecContent('specs/feature-a.md', null)
    );

    // When enabled: false, fetchStatus is 'idle'
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useSpecSession', () => {
  it('should fetch session for spec with existing review', async () => {
    const { result } = renderHook(() =>
      useSpecSession('specs/feature-a.md', '/test/project')
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.sessionId).toBe(mockSession.sessionId);
    expect(result.current.data?.status).toBe('completed');
  });

  it('should return null for spec without review session', async () => {
    const { result } = renderHook(() =>
      useSpecSession('specs/feature-b.md', '/test/project')
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('should include suggestions in session', async () => {
    const { result } = renderHook(() =>
      useSpecSession('specs/feature-a.md', '/test/project')
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.suggestions).toHaveLength(2);
    expect(result.current.data?.suggestions[0].severity).toBe('warning');
  });

  it('should include review result in session', async () => {
    const { result } = renderHook(() =>
      useSpecSession('specs/feature-a.md', '/test/project')
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.reviewResult).toBeDefined();
    expect(result.current.data?.reviewResult?.verdict).toBe('NEEDS_IMPROVEMENT');
  });

  it('should not fetch when path is null', () => {
    const { result } = renderHook(() =>
      useSpecSession(null, '/test/project')
    );

    // When enabled: false, fetchStatus is 'idle'
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useGenerationStatus', () => {
  it('should fetch generation status successfully', async () => {
    const { result } = renderHook(() =>
      useGenerationStatus('/test/project')
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ generating: false });
  });

  it('should not fetch when project is null', () => {
    const { result } = renderHook(() =>
      useGenerationStatus(null)
    );

    // When enabled: false, fetchStatus is 'idle'
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });
});
