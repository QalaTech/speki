import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSpecReview, TrackedSuggestion, ReviewVerdict } from '../useSpecReview';

const createMockSuggestion = (
  overrides: Partial<TrackedSuggestion> = {}
): TrackedSuggestion => ({
  id: 'sug-1',
  category: 'clarity',
  severity: 'warning',
  section: 'Requirements',
  textSnippet: 'Sample text',
  issue: 'Unclear requirement',
  suggestedFix: 'Add more detail',
  status: 'pending',
  ...overrides,
});

describe('useSpecReview', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('useSpecReview_InitializesState', () => {
    it('should have null sessionId initially', () => {
      const { result } = renderHook(() => useSpecReview());
      expect(result.current.sessionId).toBeNull();
    });

    it('should have empty suggestions initially', () => {
      const { result } = renderHook(() => useSpecReview());
      expect(result.current.suggestions).toEqual([]);
    });

    it('should have null verdict initially', () => {
      const { result } = renderHook(() => useSpecReview());
      expect(result.current.verdict).toBeNull();
    });

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useSpecReview());
      expect(result.current.isLoading).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useSpecReview());
      expect(result.current.error).toBeNull();
    });

    it('should not have started initially', () => {
      const { result } = renderHook(() => useSpecReview());
      expect(result.current.hasStarted).toBe(false);
    });
  });

  describe('useSpecReview_StartReviewLoads', () => {
    it('should set isLoading to true when starting review', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
        new Promise(() => {})
      );

      const { result } = renderHook(() => useSpecReview());

      act(() => {
        result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should set hasStarted to true when starting review', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
        new Promise(() => {})
      );

      const { result } = renderHook(() => useSpecReview());

      act(() => {
        result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.hasStarted).toBe(true);
    });

    it('should set specFilePath when starting review', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
        new Promise(() => {})
      );

      const { result } = renderHook(() => useSpecReview());

      act(() => {
        result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.specFilePath).toBe('/path/to/spec.md');
    });

    it('should set sessionId from API response', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        verdict: 'PASS' as ReviewVerdict,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.sessionId).toBe('session-123');
    });

    it('should set error on API failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Review failed' }),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.error).toBe('Review failed');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('useSpecReview_TracksSuggestions', () => {
    it('should populate suggestions from API response', async () => {
      const suggestions = [
        createMockSuggestion({ id: 'sug-1' }),
        createMockSuggestion({ id: 'sug-2', severity: 'critical' }),
      ];

      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'NEEDS_IMPROVEMENT' as ReviewVerdict,
          suggestions,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions[0].id).toBe('sug-1');
      expect(result.current.suggestions[1].id).toBe('sug-2');
    });

    it('should update suggestion status to approved', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'NEEDS_IMPROVEMENT' as ReviewVerdict,
          suggestions: [createMockSuggestion({ id: 'sug-1', status: 'pending' })],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      act(() => {
        result.current.updateSuggestionStatus('sug-1', 'approved');
      });

      expect(result.current.suggestions[0].status).toBe('approved');
      expect(result.current.suggestions[0].reviewedAt).toBeDefined();
    });

    it('should update suggestion status to edited with userVersion', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'NEEDS_IMPROVEMENT' as ReviewVerdict,
          suggestions: [createMockSuggestion({ id: 'sug-1', status: 'pending' })],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      act(() => {
        result.current.updateSuggestionStatus('sug-1', 'edited', 'My custom fix');
      });

      expect(result.current.suggestions[0].status).toBe('edited');
      expect(result.current.suggestions[0].userVersion).toBe('My custom fix');
    });

    it('should preserve other suggestions when updating one', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'NEEDS_IMPROVEMENT' as ReviewVerdict,
          suggestions: [
            createMockSuggestion({ id: 'sug-1', status: 'pending' }),
            createMockSuggestion({ id: 'sug-2', status: 'pending' }),
          ],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      act(() => {
        result.current.updateSuggestionStatus('sug-1', 'approved');
      });

      expect(result.current.suggestions[0].status).toBe('approved');
      expect(result.current.suggestions[1].status).toBe('pending');
    });
  });

  describe('useSpecReview_TracksVerdict', () => {
    it('should set verdict from API response', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'PASS' as ReviewVerdict,
          suggestions: [],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.verdict).toBe('PASS');
    });

    it('should set NEEDS_IMPROVEMENT verdict', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'NEEDS_IMPROVEMENT' as ReviewVerdict,
          suggestions: [createMockSuggestion()],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.verdict).toBe('NEEDS_IMPROVEMENT');
    });

    it('should set SPLIT_RECOMMENDED verdict with splitProposal', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'SPLIT_RECOMMENDED' as ReviewVerdict,
          suggestions: [],
          splitProposal: {
            proposedSpecs: [
              {
                name: 'Auth Spec',
                filename: 'auth-spec.md',
                description: 'Authentication features',
                sections: ['Login', 'Logout'],
                estimatedStories: 5,
              },
            ],
          },
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.verdict).toBe('SPLIT_RECOMMENDED');
      expect(result.current.splitProposal).toBeDefined();
      expect(result.current.splitProposal?.proposedSpecs).toHaveLength(1);
      expect(result.current.splitProposal?.proposedSpecs[0].name).toBe('Auth Spec');
    });

    it('should reset verdict on reset()', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'completed',
        reviewResult: {
          verdict: 'PASS' as ReviewVerdict,
          suggestions: [],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpecReview());

      await act(async () => {
        await result.current.startReview('/path/to/spec.md');
      });

      expect(result.current.verdict).toBe('PASS');

      act(() => {
        result.current.reset();
      });

      expect(result.current.verdict).toBeNull();
      expect(result.current.sessionId).toBeNull();
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.hasStarted).toBe(false);
    });
  });
});
