import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleApproval,
  handleRejection,
  handleEdit,
  createAgentContext,
  type AgentContext,
} from '../feedback-handler.js';
import type { SessionFile, SuggestionCard } from '../../types/index.js';

vi.mock('../session-file.js', () => ({
  saveSession: vi.fn().mockResolvedValue(undefined),
}));

function createMockSession(suggestions: SuggestionCard[]): SessionFile {
  return {
    sessionId: 'test-session-123',
    specFilePath: '/path/to/spec.md',
    status: 'in_progress',
    startedAt: '2026-01-11T10:00:00Z',
    lastUpdatedAt: '2026-01-11T10:00:00Z',
    suggestions,
    changeHistory: [],
    chatMessages: [],
  };
}

function createMockSuggestion(overrides: Partial<SuggestionCard> = {}): SuggestionCard {
  return {
    id: 'suggestion-1',
    category: 'clarity',
    severity: 'warning',
    section: 'Requirements',
    textSnippet: 'Some vague requirement',
    issue: 'Requirement is too vague',
    suggestedFix: 'Add specific acceptance criteria',
    status: 'pending',
    ...overrides,
  };
}

describe('feedback-handler', () => {
  let context: AgentContext;

  beforeEach(() => {
    context = createAgentContext();
    vi.clearAllMocks();
  });

  describe('handleApproval', () => {
    it('should update agent context with approved category', async () => {
      const suggestion = createMockSuggestion({ category: 'testability' });
      const session = createMockSession([suggestion]);

      const result = await handleApproval(
        session,
        { sessionId: 'test-session-123', suggestionId: 'suggestion-1', action: 'approved' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.context.approvedCategories).toContain('testability');
      expect(result.updatedSuggestion.status).toBe('approved');
      expect(result.updatedSuggestion.reviewedAt).toBeDefined();
    });

    it('should not duplicate categories when approving multiple of the same', async () => {
      const suggestion1 = createMockSuggestion({ id: 'sug-1', category: 'clarity' });
      const suggestion2 = createMockSuggestion({ id: 'sug-2', category: 'clarity' });
      const session = createMockSession([suggestion1, suggestion2]);

      await handleApproval(
        session,
        { sessionId: 'test-session-123', suggestionId: 'sug-1', action: 'approved' },
        context
      );
      await handleApproval(
        session,
        { sessionId: 'test-session-123', suggestionId: 'sug-2', action: 'approved' },
        context
      );

      expect(context.approvedCategories).toEqual(['clarity']);
    });
  });

  describe('handleRejection', () => {
    it('should update agent context with rejection pattern', async () => {
      const suggestion = createMockSuggestion({ category: 'completeness' });
      const session = createMockSession([suggestion]);

      const result = await handleRejection(
        session,
        { sessionId: 'test-session-123', suggestionId: 'suggestion-1', action: 'rejected' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.context.rejectedCategories).toContain('completeness');
      expect(result.context.rejectionPatterns).toHaveLength(1);
      expect(result.context.rejectionPatterns[0].category).toBe('completeness');
      expect(result.context.rejectionPatterns[0].originalIssue).toBe('Requirement is too vague');
      expect(result.updatedSuggestion.status).toBe('rejected');
    });
  });

  describe('handleRejection alternative triggering', () => {
    it('should trigger alternative after multiple rejections in same category', async () => {
      const suggestion1 = createMockSuggestion({ id: 'sug-1', category: 'clarity' });
      const suggestion2 = createMockSuggestion({ id: 'sug-2', category: 'clarity' });
      const session = createMockSession([suggestion1, suggestion2]);

      await handleRejection(
        session,
        { sessionId: 'test-session-123', suggestionId: 'sug-1', action: 'rejected' },
        context
      );

      const result = await handleRejection(
        session,
        { sessionId: 'test-session-123', suggestionId: 'sug-2', action: 'rejected' },
        context
      );

      expect(result.alternativeTriggered).toBe(true);
    });

    it('should not trigger alternative for single rejection', async () => {
      const suggestion = createMockSuggestion();
      const session = createMockSession([suggestion]);

      const result = await handleRejection(
        session,
        { sessionId: 'test-session-123', suggestionId: 'suggestion-1', action: 'rejected' },
        context
      );

      expect(result.alternativeTriggered).toBe(false);
    });

    it('should respect explicit triggerAlternative option', async () => {
      const suggestion = createMockSuggestion();
      const session = createMockSession([suggestion]);

      const result = await handleRejection(
        session,
        { sessionId: 'test-session-123', suggestionId: 'suggestion-1', action: 'rejected' },
        context,
        { triggerAlternative: true }
      );

      expect(result.alternativeTriggered).toBe(true);
    });
  });

  describe('handleEdit', () => {
    it('should store user version in agent context', async () => {
      const suggestion = createMockSuggestion();
      const session = createMockSession([suggestion]);
      const userVersion = 'Add specific acceptance criteria with measurable outcomes';

      const result = await handleEdit(
        session,
        {
          sessionId: 'test-session-123',
          suggestionId: 'suggestion-1',
          action: 'edited',
          userVersion,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.updatedSuggestion.status).toBe('edited');
      expect(result.updatedSuggestion.userVersion).toBe(userVersion);
      expect(result.context.userEdits.get('suggestion-1')).toBe(userVersion);
    });

    it('should throw error when userVersion is missing', async () => {
      const suggestion = createMockSuggestion();
      const session = createMockSession([suggestion]);

      await expect(
        handleEdit(
          session,
          { sessionId: 'test-session-123', suggestionId: 'suggestion-1', action: 'edited' },
          context
        )
      ).rejects.toThrow('userVersion is required for edit action');
    });
  });
});
