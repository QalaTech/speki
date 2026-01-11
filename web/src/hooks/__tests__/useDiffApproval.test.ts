import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDiffApproval } from '../useDiffApproval';
import type { SuggestionCard } from '../../../../src/types/index.js';

// Mock the useAgentFeedback hook
vi.mock('../useAgentFeedback', () => ({
  useAgentFeedback: () => ({
    sendApprovalFeedback: vi.fn().mockResolvedValue({ success: true }),
    sendRejectionFeedback: vi.fn().mockResolvedValue({ success: true }),
    sendEditFeedback: vi.fn().mockResolvedValue({ success: true }),
    resetFeedbackState: vi.fn(),
    status: 'idle',
    error: null,
    lastSuggestionId: null,
  }),
}));

function createMockSuggestion(overrides?: Partial<SuggestionCard>): SuggestionCard {
  return {
    id: 'suggestion-1',
    category: 'clarity',
    severity: 'warning',
    section: 'Requirements',
    lineStart: 10,
    lineEnd: 12,
    textSnippet: 'The user should be able to login',
    issue: 'Missing acceptance criteria',
    suggestedFix: 'The user should be able to login with email and password',
    status: 'pending',
    ...overrides,
  };
}

function createMockEditorActions() {
  return {
    setContent: vi.fn(),
    markClean: vi.fn(),
    getSelection: vi.fn().mockReturnValue(''),
    scrollToHeading: vi.fn().mockReturnValue(true),
    scrollToLineNumber: vi.fn().mockReturnValue(true),
    highlight: vi.fn().mockReturnValue(null),
    enterDiffMode: vi.fn(),
    exitDiffMode: vi.fn().mockReturnValue('updated content'),
    getDiffProposedContent: vi.fn().mockReturnValue('edited content'),
  };
}

describe('useDiffApproval', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  describe('diffApproval_ShowsSideBySide', () => {
    it('should initialize with inactive state', () => {
      const { result } = renderHook(() => useDiffApproval());

      expect(result.current.isActive).toBe(false);
      expect(result.current.currentSuggestion).toBeNull();
    });

    it('should enter diff mode when enterDiffMode is called', () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original content');
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.currentSuggestion).toEqual(suggestion);
      expect(editorActions.enterDiffMode).toHaveBeenCalled();
    });

    it('should call enterDiffMode on editor with correct parameters', () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original content');
      });

      expect(editorActions.enterDiffMode).toHaveBeenCalledWith(
        'original content',
        expect.any(String),
        expect.objectContaining({
          lineNumber: 10,
          sectionHeading: 'Requirements',
        })
      );
    });
  });

  describe('diffApproval_ApproveAppliesChange', () => {
    it('should call exitDiffMode with applyChanges=true on approve', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();
      const onSaveFile = vi.fn().mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      await act(async () => {
        await result.current.approve('session-1', editorActions, onSaveFile);
      });

      expect(editorActions.exitDiffMode).toHaveBeenCalledWith(true);
    });

    it('should save file after approval', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();
      const onSaveFile = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      await act(async () => {
        await result.current.approve('session-1', editorActions, onSaveFile);
      });

      expect(onSaveFile).toHaveBeenCalledWith('updated content');
    });

    it('should highlight changes after approval', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();
      const onSaveFile = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      await act(async () => {
        await result.current.approve('session-1', editorActions, onSaveFile);
      });

      expect(editorActions.highlight).toHaveBeenCalledWith(
        suggestion.suggestedFix,
        2000
      );
    });
  });

  describe('diffApproval_RejectDiscards', () => {
    it('should call exitDiffMode with applyChanges=false on reject', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      await act(async () => {
        await result.current.reject('session-1', editorActions);
      });

      expect(editorActions.exitDiffMode).toHaveBeenCalledWith(false);
    });

    it('should reset state after rejection', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      expect(result.current.isActive).toBe(true);

      await act(async () => {
        await result.current.reject('session-1', editorActions);
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.currentSuggestion).toBeNull();
    });
  });

  describe('diffApproval_EditAllowsModification', () => {
    it('should set isEditing to true when startEdit is called', () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      act(() => {
        result.current.startEdit();
      });

      expect(result.current.isEditing).toBe(true);
    });

    it('should get user-edited content on applyEdit', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();
      const onSaveFile = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      act(() => {
        result.current.startEdit();
      });

      await act(async () => {
        await result.current.applyEdit('session-1', editorActions, onSaveFile);
      });

      expect(editorActions.getDiffProposedContent).toHaveBeenCalled();
    });

    it('should save file with edited content', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();
      const onSaveFile = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      act(() => {
        result.current.startEdit();
      });

      await act(async () => {
        await result.current.applyEdit('session-1', editorActions, onSaveFile);
      });

      expect(onSaveFile).toHaveBeenCalled();
    });
  });

  describe('diffApproval_SendsFeedback', () => {
    it('should reset loading state after approve completes', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();
      const onSaveFile = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      await act(async () => {
        await result.current.approve('session-1', editorActions, onSaveFile);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isActive).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();
      const onSaveFile = vi.fn().mockRejectedValue(new Error('Save failed'));

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      await act(async () => {
        await result.current.approve('session-1', editorActions, onSaveFile);
      });

      expect(result.current.error).toBe('Save failed');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should reset state and exit diff mode without applying', () => {
      const { result } = renderHook(() => useDiffApproval());
      const suggestion = createMockSuggestion();
      const editorActions = createMockEditorActions();

      act(() => {
        result.current.enterDiffMode(suggestion, editorActions, 'original');
      });

      expect(result.current.isActive).toBe(true);

      act(() => {
        result.current.cancel(editorActions);
      });

      expect(editorActions.exitDiffMode).toHaveBeenCalledWith(false);
      expect(result.current.isActive).toBe(false);
    });
  });
});
