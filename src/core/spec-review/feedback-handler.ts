import type { SessionFile, SuggestionCard, SuggestionStatus } from '../../types/index.js';
import { saveSession } from './session-file.js';

/**
 * Agent context for preference learning within a session.
 * Tracks user preferences to improve future suggestions.
 */
export interface AgentContext {
  /** Categories the user prefers/approves */
  approvedCategories: string[];
  /** Categories the user rejects */
  rejectedCategories: string[];
  /** User-provided alternatives keyed by original suggestion ID */
  userEdits: Map<string, string>;
  /** Rejection patterns for alternative generation */
  rejectionPatterns: RejectionPattern[];
}

/**
 * Pattern extracted from rejected suggestions to improve alternatives.
 */
export interface RejectionPattern {
  suggestionId: string;
  category: string;
  originalIssue: string;
  rejectedAt: string;
}

/**
 * Feedback provided by the user on a suggestion.
 */
export interface FeedbackInput {
  sessionId: string;
  suggestionId: string;
  action: SuggestionStatus;
  userVersion?: string;
}

/**
 * Result from handling feedback, including updated context.
 */
export interface FeedbackResult {
  success: boolean;
  updatedSuggestion: SuggestionCard;
  context: AgentContext;
  alternativeTriggered?: boolean;
}

/**
 * Creates a new empty agent context.
 */
export function createAgentContext(): AgentContext {
  return {
    approvedCategories: [],
    rejectedCategories: [],
    userEdits: new Map(),
    rejectionPatterns: [],
  };
}

/**
 * Handles approval feedback: updates suggestion status and agent context.
 */
export async function handleApproval(
  session: SessionFile,
  feedback: FeedbackInput,
  context: AgentContext
): Promise<FeedbackResult> {
  const suggestion = findSuggestion(session, feedback.suggestionId);
  if (!suggestion) {
    throw new Error(`Suggestion not found: ${feedback.suggestionId}`);
  }

  const updatedSuggestion = updateSuggestionStatus(suggestion, 'approved');
  updateSessionSuggestion(session, updatedSuggestion);

  if (!context.approvedCategories.includes(suggestion.category)) {
    context.approvedCategories.push(suggestion.category);
  }

  await saveSession(session);

  return {
    success: true,
    updatedSuggestion,
    context,
  };
}

/**
 * Handles rejection feedback: updates suggestion status, agent context,
 * and may trigger alternative proposal generation.
 */
export async function handleRejection(
  session: SessionFile,
  feedback: FeedbackInput,
  context: AgentContext,
  options?: { triggerAlternative?: boolean }
): Promise<FeedbackResult> {
  const suggestion = findSuggestion(session, feedback.suggestionId);
  if (!suggestion) {
    throw new Error(`Suggestion not found: ${feedback.suggestionId}`);
  }

  const updatedSuggestion = updateSuggestionStatus(suggestion, 'rejected');
  updateSessionSuggestion(session, updatedSuggestion);

  if (!context.rejectedCategories.includes(suggestion.category)) {
    context.rejectedCategories.push(suggestion.category);
  }

  const rejectionPattern: RejectionPattern = {
    suggestionId: suggestion.id,
    category: suggestion.category,
    originalIssue: suggestion.issue,
    rejectedAt: new Date().toISOString(),
  };
  context.rejectionPatterns.push(rejectionPattern);

  await saveSession(session);

  const alternativeTriggered = options?.triggerAlternative ?? shouldTriggerAlternative(context);

  return {
    success: true,
    updatedSuggestion,
    context,
    alternativeTriggered,
  };
}

/**
 * Handles edit feedback: learns from user modifications.
 * Stores the user's alternative version for preference learning.
 */
export async function handleEdit(
  session: SessionFile,
  feedback: FeedbackInput,
  context: AgentContext
): Promise<FeedbackResult> {
  const suggestion = findSuggestion(session, feedback.suggestionId);
  if (!suggestion) {
    throw new Error(`Suggestion not found: ${feedback.suggestionId}`);
  }

  if (!feedback.userVersion) {
    throw new Error('userVersion is required for edit action');
  }

  const updatedSuggestion: SuggestionCard = {
    ...suggestion,
    status: 'edited',
    userVersion: feedback.userVersion,
    reviewedAt: new Date().toISOString(),
  };
  updateSessionSuggestion(session, updatedSuggestion);

  context.userEdits.set(suggestion.id, feedback.userVersion);

  await saveSession(session);

  return {
    success: true,
    updatedSuggestion,
    context,
  };
}

/**
 * Determines whether to trigger alternative proposal based on rejection patterns.
 * Triggers alternative if there are multiple rejections in the same category.
 */
function shouldTriggerAlternative(context: AgentContext): boolean {
  const categoryCounts = new Map<string, number>();

  for (const pattern of context.rejectionPatterns) {
    const count = (categoryCounts.get(pattern.category) ?? 0) + 1;
    if (count >= 2) {
      return true;
    }
    categoryCounts.set(pattern.category, count);
  }

  return false;
}

function findSuggestion(session: SessionFile, suggestionId: string): SuggestionCard | undefined {
  return session.suggestions.find((s) => s.id === suggestionId);
}

function updateSuggestionStatus(suggestion: SuggestionCard, status: SuggestionStatus): SuggestionCard {
  return {
    ...suggestion,
    status,
    reviewedAt: new Date().toISOString(),
  };
}

function updateSessionSuggestion(session: SessionFile, updatedSuggestion: SuggestionCard): void {
  const index = session.suggestions.findIndex((s) => s.id === updatedSuggestion.id);
  if (index !== -1) {
    session.suggestions[index] = updatedSuggestion;
    session.lastUpdatedAt = new Date().toISOString();
  }
}
