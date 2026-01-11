import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSplitPreview } from '../useSplitPreview';
import type { SplitProposal, ProposedSpec } from '../../../../src/types/index.js';

const mockProposedSpec = (overrides?: Partial<ProposedSpec>): ProposedSpec => ({
  filename: 'auth-spec.md',
  description: 'Authentication features',
  estimatedStories: 8,
  sections: ['Authentication', 'Authorization'],
  ...overrides,
});

const mockSplitProposal = (overrides?: Partial<SplitProposal>): SplitProposal => ({
  originalFile: 'god-spec.md',
  reason: 'Too many concerns',
  proposedSpecs: [
    mockProposedSpec({ filename: 'auth-spec.md' }),
    mockProposedSpec({ filename: 'user-spec.md' }),
  ],
  ...overrides,
});

describe('useSplitPreview', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useSplitPreview());

      expect(result.current.isOpen).toBe(false);
      expect(result.current.isSaving).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.proposal).toBeNull();
      expect(result.current.previewFiles).toEqual([]);
      expect(result.current.error).toBeNull();
      expect(result.current.createdFiles).toEqual([]);
    });
  });

  describe('openPreview', () => {
    it('should set isOpen to true and fetch preview content', async () => {
      const mockPreviewFiles = [
        { filename: 'auth-spec.md', description: 'Auth', content: '# Auth', proposedSpec: mockProposedSpec() },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ previewFiles: mockPreviewFiles }),
      });

      const { result } = renderHook(() => useSplitPreview());

      await act(async () => {
        await result.current.openPreview(mockSplitProposal(), '/path/to/spec.md');
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.previewFiles).toEqual(mockPreviewFiles);
    });

    it('should set proposal when opening preview', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ previewFiles: [] }),
      });

      const proposal = mockSplitProposal();
      const { result } = renderHook(() => useSplitPreview());

      await act(async () => {
        await result.current.openPreview(proposal, '/path/to/spec.md');
      });

      expect(result.current.proposal).toEqual(proposal);
    });

    it('should set error when fetch fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to load preview' }),
      });

      const { result } = renderHook(() => useSplitPreview());

      await act(async () => {
        await result.current.openPreview(mockSplitProposal(), '/path/to/spec.md');
      });

      expect(result.current.error).toBe('Failed to load preview');
      expect(result.current.isLoading).toBe(false);
    });

    it('should include projectPath in API request', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ previewFiles: [] }),
      });

      const { result } = renderHook(() => useSplitPreview());

      await act(async () => {
        await result.current.openPreview(mockSplitProposal(), '/path/to/spec.md', '/project/path');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('project='),
        expect.any(Object)
      );
    });
  });

  describe('saveAll', () => {
    it('should send files to API and update state on success', async () => {
      const createdFiles = ['/path/to/auth-spec.md', '/path/to/user-spec.md'];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, createdFiles }),
      });

      const { result } = renderHook(() => useSplitPreview());

      const files = [
        { filename: 'auth-spec.md', description: 'Auth', content: '# Auth', proposedSpec: mockProposedSpec() },
      ];

      await act(async () => {
        await result.current.saveAll(files, '/path/to/spec.md');
      });

      expect(result.current.isSaving).toBe(false);
      expect(result.current.isOpen).toBe(false);
      expect(result.current.createdFiles).toEqual(createdFiles);
    });

    it('should include sessionId when provided', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, createdFiles: [] }),
      });

      const { result } = renderHook(() => useSplitPreview());

      const files = [
        { filename: 'auth-spec.md', description: 'Auth', content: '# Auth', proposedSpec: mockProposedSpec() },
      ];

      await act(async () => {
        await result.current.saveAll(files, '/path/to/spec.md', 'session-123');
      });

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.sessionId).toBe('session-123');
    });

    it('should set error when save fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to save' }),
      });

      const { result } = renderHook(() => useSplitPreview());

      const files = [
        { filename: 'auth-spec.md', description: 'Auth', content: '# Auth', proposedSpec: mockProposedSpec() },
      ];

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.saveAll(files, '/path/to/spec.md');
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to save');
      expect(result.current.error).toBe('Failed to save');
      expect(result.current.isSaving).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should set isOpen to false', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ previewFiles: [] }),
      });

      const { result } = renderHook(() => useSplitPreview());

      await act(async () => {
        await result.current.openPreview(mockSplitProposal(), '/path/to/spec.md');
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.cancel();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          previewFiles: [{ filename: 'test.md', description: 'Test', content: '#', proposedSpec: mockProposedSpec() }],
        }),
      });

      const { result } = renderHook(() => useSplitPreview());

      await act(async () => {
        await result.current.openPreview(mockSplitProposal(), '/path/to/spec.md');
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.previewFiles).toHaveLength(1);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.previewFiles).toEqual([]);
      expect(result.current.proposal).toBeNull();
    });
  });
});
