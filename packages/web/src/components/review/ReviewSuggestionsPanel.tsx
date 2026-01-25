import type React from 'react';
import type {
  SuggestionCard as SuggestionCardType,
  SpecReviewResult,
  GodSpecIndicators,
  SplitProposal,
  ChatMessage,
} from '@speki/core';
import { SuggestionCard } from './SuggestionCard';
import { BatchNavigation } from './BatchNavigation';
import { GodSpecWarning } from './GodSpecWarning';
import { ReviewChat } from './ReviewChat';

interface DiscussingContext {
  suggestionId: string;
  issue: string;
  suggestedFix: string;
}

interface ReviewSuggestionsPanelProps {
  width: number;
  suggestions: SuggestionCardType[];
  reviewResult: SpecReviewResult | null;
  sessionId: string | null;
  loadingSession: boolean;
  isStartingReview: boolean;
  sessionStatus: 'in_progress' | 'completed' | 'needs_attention' | null;
  reviewError: string | null;
  selectedFile: string;
  projectPath?: string;

  // God spec state
  showGodSpecWarning: boolean;
  godSpecIndicators: GodSpecIndicators | null;
  splitProposal: SplitProposal | null;

  // Chat state
  chatMessages: ChatMessage[];
  isSendingMessage: boolean;
  selectedText?: string;
  discussingContext: DiscussingContext | null;

  // Batch navigation state
  currentSuggestionIndex: number;
  isBatchProcessing: boolean;
  isDiffLoading: boolean;

  // Handlers
  onReviewDiff: (suggestionId: string) => void;
  onShowInEditor: (suggestionId: string) => void;
  onDismiss: (suggestionId: string) => void;
  onDiscussSuggestion: (suggestionId: string) => void;
  onBatchNavigate: (index: number) => void;
  onApproveAll: () => Promise<void>;
  onRejectAll: () => Promise<void>;
  onStartReview: () => Promise<void>;
  onSendMessage: (message: string, selectionContext?: string, suggestionId?: string) => Promise<void>;
  onClearDiscussingContext: () => void;

  // God spec handlers
  onAcceptSplit: (proposal: SplitProposal) => Promise<void>;
  onModifySplit: (proposal: SplitProposal) => Promise<void>;
  onSkipSplit: () => void;
}

export function ReviewSuggestionsPanel({
  width,
  suggestions,
  reviewResult,
  sessionId,
  loadingSession,
  isStartingReview,
  sessionStatus,
  reviewError,
  selectedFile,
  projectPath,
  showGodSpecWarning,
  godSpecIndicators,
  splitProposal,
  chatMessages,
  isSendingMessage,
  selectedText,
  discussingContext,
  currentSuggestionIndex,
  isBatchProcessing,
  isDiffLoading,
  onReviewDiff,
  onShowInEditor,
  onDismiss,
  onDiscussSuggestion,
  onBatchNavigate,
  onApproveAll,
  onRejectAll,
  onStartReview,
  onSendMessage,
  onClearDiscussingContext,
  onAcceptSplit,
  onModifySplit,
  onSkipSplit,
}: ReviewSuggestionsPanelProps): React.ReactElement {
  // Filter pending suggestions - only show critical and warning severity
  const pendingSuggestions = suggestions.filter(
    (s) => s.status === 'pending' && (s.severity === 'critical' || s.severity === 'warning')
  );

  return (
    <div
      className="flex flex-col"
      style={{ width: `${width}%` }}
      data-testid="right-panel"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-200">
        <span className="text-sm font-semibold">Review Panel</span>
        {reviewResult && (
          <span className={`badge ${reviewResult.verdict === 'PASS' ? 'badge-success' : reviewResult.verdict === 'FAIL' ? 'badge-error' : 'badge-warning'} badge-sm`}>
            {reviewResult.verdict}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {/* God spec warning */}
        {showGodSpecWarning && godSpecIndicators && (
          <GodSpecWarning
            indicators={godSpecIndicators}
            splitProposal={splitProposal || undefined}
            onAcceptSplit={onAcceptSplit}
            onModify={onModifySplit}
            onSkip={onSkipSplit}
          />
        )}

        {pendingSuggestions.length > 0 ? (
          <>
            <BatchNavigation
              suggestions={pendingSuggestions}
              currentIndex={currentSuggestionIndex}
              onNavigate={onBatchNavigate}
              onApproveAll={onApproveAll}
              onRejectAll={onRejectAll}
              disabled={isBatchProcessing || isDiffLoading}
            />
            <div className="space-y-3" data-testid="suggestions-list">
              {pendingSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onReviewDiff={onReviewDiff}
                  onDiscuss={onDiscussSuggestion}
                  onShowInEditor={onShowInEditor}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="no-suggestions">
            {loadingSession ? (
              <div className="flex flex-col items-center gap-3" data-testid="loading-session">
                <span className="loading loading-spinner loading-md"></span>
                <p className="text-sm opacity-70">Loading review data...</p>
              </div>
            ) : isStartingReview || sessionStatus === 'in_progress' ? (
              <div className="flex flex-col items-center gap-3" data-testid="review-in-progress">
                <span className="loading loading-spinner loading-md text-primary"></span>
                <p className="font-medium">Running AI Review...</p>
                <p className="text-sm opacity-60">This may take 2-5 minutes as multiple prompts are analyzed.</p>
              </div>
            ) : !reviewResult ? (
              <div className="flex flex-col items-center gap-4">
                <p className="opacity-70">No review results yet.</p>
                {reviewError && (
                  <p className="text-error text-sm" data-testid="review-error">
                    {reviewError}
                  </p>
                )}
                <button
                  className="btn btn-glass-primary"
                  onClick={onStartReview}
                  disabled={!selectedFile || isStartingReview}
                  data-testid="start-review-button"
                >
                  {isStartingReview ? 'Starting...' : 'Start Review'}
                </button>
              </div>
            ) : (
              <p className="opacity-70">All critical/warning suggestions have been reviewed.</p>
            )}
          </div>
        )}

        {/* Review Chat */}
        {sessionId && (
          <div className="mt-4 border-t border-base-300 pt-4" data-testid="review-chat-section">
            <div className="text-sm font-semibold mb-3 opacity-70">Chat</div>
            <ReviewChat
              messages={chatMessages}
              sessionId={sessionId}
              selectedText={selectedText}
              discussingContext={discussingContext}
              onSendMessage={onSendMessage}
              onClearDiscussingContext={onClearDiscussingContext}
              isSending={isSendingMessage}
              projectPath={projectPath}
            />
          </div>
        )}
      </div>
    </div>
  );
}
