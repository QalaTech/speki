import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSession, SessionData } from '../useSession';

const createMockSession = (overrides: Partial<SessionData> = {}): SessionData => ({
  sessionId: 'session-123',
  specFilePath: '/path/to/spec.md',
  status: 'in_progress',
  startedAt: '2026-01-11T10:00:00Z',
  lastUpdatedAt: '2026-01-11T10:00:00Z',
  suggestions: [],
  changeHistory: [],
  chatMessages: [],
  contentHash: 'abc123hash',
  ...overrides,
});

const createMockDigest = () => {
  return vi.fn().mockImplementation(async (_algorithm: string, data: ArrayBuffer) => {
    const bytes = new Uint8Array(data);
    const hash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      hash[i] = bytes[i % bytes.length] || i;
    }
    return hash.buffer;
  });
};

describe('useSession', () => {
  const originalFetch = global.fetch;
  let digestSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
    digestSpy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(createMockDigest());
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    digestSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('useSession_LoadsExistingSession', () => {
    it('should set isLoading to true when loading session', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
        new Promise(() => {})
      );

      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should load existing session from API', async () => {
      const mockSession = createMockSession();

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.sessionId).toBe('session-123');
      expect(result.current.isLoading).toBe(false);
    });

    it('should set session status from loaded data', async () => {
      const mockSession = createMockSession({ status: 'completed' });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.session?.status).toBe('completed');
    });

    it('should load change history and chat messages', async () => {
      const mockSession = createMockSession({
        changeHistory: [
          {
            id: 'change-1',
            timestamp: '2026-01-11T10:00:00Z',
            description: 'Updated requirements',
            filePath: '/path/to/spec.md',
            beforeContent: 'old',
            afterContent: 'new',
            reverted: false,
          },
        ],
        chatMessages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: '2026-01-11T10:00:00Z',
          },
        ],
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.session?.changeHistory).toHaveLength(1);
      expect(result.current.session?.changeHistory[0].id).toBe('change-1');
      expect(result.current.session?.chatMessages).toHaveLength(1);
      expect(result.current.session?.chatMessages[0].content).toBe('Hello');
    });
  });

  describe('useSession_CreatesNewSession', () => {
    it('should create new session when no existing session', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: null }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/new-spec.md');
      });

      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.specFilePath).toBe('/path/to/new-spec.md');
      expect(result.current.session?.status).toBe('in_progress');
    });

    it('should generate unique session ID for new session', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: null }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.session?.sessionId).toMatch(/^session-\d+-[a-z0-9]+$/);
    });

    it('should initialize empty arrays for new session', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: null }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.session?.suggestions).toEqual([]);
      expect(result.current.session?.changeHistory).toEqual([]);
      expect(result.current.session?.chatMessages).toEqual([]);
    });
  });

  describe('useSession_DetectsExternalChanges', () => {
    it('should detect when spec content hash differs from session hash', async () => {
      const mockSession = createMockSession({ contentHash: 'old-hash-abc' });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                files: [{ path: '/path/to/spec.md', content: 'modified content' }],
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.hasExternalChanges).toBe(true);
      expect(result.current.showChangeDialog).toBe(true);
    });

    it('should not show change dialog when hashes match', async () => {
      const mockSession = createMockSession();

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.showChangeDialog).toBe(false);
    });

    it('should allow user to continue with existing session', async () => {
      const mockSession = createMockSession({ contentHash: 'old-hash' });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                files: [{ path: '/path/to/spec.md', content: 'new content' }],
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.showChangeDialog).toBe(true);

      act(() => {
        result.current.handleContinue();
      });

      expect(result.current.showChangeDialog).toBe(false);
      expect(result.current.session?.sessionId).toBe('session-123');
    });

    it('should allow user to start fresh with new session', async () => {
      const mockSession = createMockSession({ contentHash: 'old-hash' });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/') && !url.includes('PUT')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                files: [{ path: '/path/to/spec.md', content: 'new content' }],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      expect(result.current.showChangeDialog).toBe(true);

      act(() => {
        result.current.handleStartFresh();
      });

      expect(result.current.showChangeDialog).toBe(false);
      expect(result.current.hasExternalChanges).toBe(false);
      expect(result.current.session?.sessionId).not.toBe('session-123');
      expect(result.current.session?.suggestions).toEqual([]);
      expect(result.current.session?.changeHistory).toEqual([]);
    });
  });

  describe('useSession_AutoSaves', () => {
    it('should auto-save after updateSession is called', async () => {
      const mockSession = createMockSession();

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      const fetchCallCountBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        result.current.updateSession({ status: 'completed' });
      });

      expect(result.current.session?.status).toBe('completed');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      const fetchCallCountAfter = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(fetchCallCountAfter).toBeGreaterThan(fetchCallCountBefore);

      const lastCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[fetchCallCountAfter - 1];
      expect(lastCall[1]?.method).toBe('PUT');
    });

    it('should debounce multiple rapid updates', async () => {
      const mockSession = createMockSession();

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      const fetchCallCountBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        result.current.updateSession({ status: 'in_progress' });
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.updateSession({ status: 'needs_attention' });
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.updateSession({ status: 'completed' });
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      const putCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .slice(fetchCallCountBefore)
        .filter((call) => call[1]?.method === 'PUT');

      expect(putCalls.length).toBe(1);
    });

    it('should update lastUpdatedAt on each update', async () => {
      const mockSession = createMockSession({
        lastUpdatedAt: '2026-01-11T10:00:00Z',
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      const initialTimestamp = result.current.session?.lastUpdatedAt;

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      act(() => {
        result.current.updateSession({ status: 'completed' });
      });

      expect(result.current.session?.lastUpdatedAt).not.toBe(initialTimestamp);
    });

    it('should handle save errors gracefully', async () => {
      const mockSession = createMockSession();

      let saveAttempted = false;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'PUT') {
          saveAttempted = true;
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Save failed' }),
          });
        }
        if (url.includes('/api/sessions/spec/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session: mockSession }),
          });
        }
        if (url.includes('/api/spec-review/files')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.loadSession('/path/to/spec.md');
      });

      act(() => {
        result.current.updateSession({ status: 'completed' });
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(saveAttempted).toBe(true);
      expect(result.current.error).toBe('Save failed');
      expect(result.current.session).not.toBeNull();
    });
  });
});
