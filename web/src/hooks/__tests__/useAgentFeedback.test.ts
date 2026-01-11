import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgentFeedback } from '../useAgentFeedback';

describe('useAgentFeedback', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('useAgentFeedback_SendsApproval', () => {
    it('should send approval feedback to API', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, suggestion: { id: 'sug-1', status: 'approved' } }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendApprovalFeedback('session-1', 'sug-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spec-review/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'session-1',
            suggestionId: 'sug-1',
            action: 'approved',
          }),
        })
      );
    });

    it('should return success result on successful approval', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      let sendResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        sendResult = await result.current.sendApprovalFeedback('session-1', 'sug-1');
      });

      expect(sendResult).toEqual({ success: true });
    });

    it('should include projectPath in URL when provided', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendApprovalFeedback('session-1', 'sug-1', '/path/to/project');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spec-review/feedback?project=%2Fpath%2Fto%2Fproject',
        expect.any(Object)
      );
    });
  });

  describe('useAgentFeedback_SendsRejection', () => {
    it('should send rejection feedback to API', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, suggestion: { id: 'sug-1', status: 'rejected' } }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendRejectionFeedback('session-1', 'sug-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spec-review/feedback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            sessionId: 'session-1',
            suggestionId: 'sug-1',
            action: 'rejected',
          }),
        })
      );
    });

    it('should return success result on successful rejection', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      let sendResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        sendResult = await result.current.sendRejectionFeedback('session-1', 'sug-1');
      });

      expect(sendResult).toEqual({ success: true });
    });

    it('should handle API error response', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Session not found' }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      let sendResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        sendResult = await result.current.sendRejectionFeedback('session-1', 'sug-1');
      });

      expect(sendResult).toEqual({ success: false, error: 'Session not found' });
    });
  });

  describe('useAgentFeedback_SendsEdit', () => {
    it('should send edit feedback with userVersion to API', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, suggestion: { id: 'sug-1', status: 'edited' } }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendEditFeedback('session-1', 'sug-1', 'My edited version');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spec-review/feedback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            sessionId: 'session-1',
            suggestionId: 'sug-1',
            action: 'edited',
            userVersion: 'My edited version',
          }),
        })
      );
    });

    it('should return success result on successful edit', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      let sendResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        sendResult = await result.current.sendEditFeedback('session-1', 'sug-1', 'Edited content');
      });

      expect(sendResult).toEqual({ success: true });
    });

    it('should handle network error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useAgentFeedback());

      let sendResult: { success: boolean; error?: string } | undefined;
      await act(async () => {
        sendResult = await result.current.sendEditFeedback('session-1', 'sug-1', 'Content');
      });

      expect(sendResult).toEqual({ success: false, error: 'Network error' });
    });
  });

  describe('useAgentFeedback_TracksState', () => {
    it('should have idle status initially', () => {
      const { result } = renderHook(() => useAgentFeedback());
      expect(result.current.status).toBe('idle');
    });

    it('should set status to pending when sending feedback', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useAgentFeedback());

      act(() => {
        result.current.sendApprovalFeedback('session-1', 'sug-1');
      });

      expect(result.current.status).toBe('pending');

      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });
    });

    it('should set status to sent on success', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendApprovalFeedback('session-1', 'sug-1');
      });

      expect(result.current.status).toBe('sent');
    });

    it('should set status to error on failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Something went wrong' }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendApprovalFeedback('session-1', 'sug-1');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Something went wrong');
    });

    it('should track lastSuggestionId', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendApprovalFeedback('session-1', 'suggestion-xyz');
      });

      expect(result.current.lastSuggestionId).toBe('suggestion-xyz');
    });

    it('should reset state when resetFeedbackState is called', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAgentFeedback());

      await act(async () => {
        await result.current.sendApprovalFeedback('session-1', 'sug-1');
      });

      expect(result.current.status).toBe('sent');
      expect(result.current.lastSuggestionId).toBe('sug-1');

      act(() => {
        result.current.resetFeedbackState();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.lastSuggestionId).toBeNull();
    });
  });
});
