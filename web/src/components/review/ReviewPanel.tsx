import type {
  SpecReviewResult,
  SpecReviewVerdict,
  GodSpecIndicators,
} from '../../../../src/types/index.js';
import { Badge, Alert, Loading } from '../ui';

export interface ReviewPanelProps {
  /** Review result to display */
  reviewResult?: SpecReviewResult;
  /** God spec indicators (displayed as warning when isGodSpec is true) */
  godSpecIndicators?: GodSpecIndicators;
  /** Whether the review is currently in progress */
  isReviewing?: boolean;
  /** Callback when user starts a chat message */
  onChatSubmit?: (message: string) => void;
}

const VERDICT_CONFIG: Record<SpecReviewVerdict, { label: string; variant: 'success' | 'error' | 'warning' | 'info' }> = {
  PASS: { label: 'Pass', variant: 'success' },
  FAIL: { label: 'Fail', variant: 'error' },
  NEEDS_IMPROVEMENT: { label: 'Needs Improvement', variant: 'warning' },
  SPLIT_RECOMMENDED: { label: 'Split Recommended', variant: 'info' },
};

export function ReviewPanel({
  reviewResult,
  godSpecIndicators,
  isReviewing = false,
  onChatSubmit,
}: ReviewPanelProps): React.ReactElement {
  const hasResult = reviewResult !== undefined;
  const showGodSpecWarning = godSpecIndicators?.isGodSpec === true;

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const input = e.currentTarget;
      const message = input.value.trim();
      if (message && onChatSubmit) {
        onChatSubmit(message);
        input.value = '';
      }
    }
  };

  const verdict = hasResult ? reviewResult.verdict : undefined;
  const config = verdict ? VERDICT_CONFIG[verdict] : { label: 'Unknown', variant: 'neutral' as const };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4" data-testid="review-panel">
      {/* Verdict Section */}
      <section className="shrink-0 p-4 bg-base-300 rounded-lg" data-testid="verdict-section">
        {isReviewing ? (
          <div className="flex items-center gap-2 text-base-content/60">
            <Loading size="sm" />
            <span>Reviewing...</span>
          </div>
        ) : hasResult ? (
          <div className="flex items-center gap-2 text-lg font-semibold" data-testid="verdict-display">
            <span className="text-base-content/60">Verdict:</span>
            <Badge variant={config.variant} size="md">{config.label}</Badge>
          </div>
        ) : (
          <div className="text-base-content/60 italic" data-testid="verdict-empty">
            <span>No review results yet</span>
          </div>
        )}
      </section>

      {/* God Spec Warning Section */}
      {showGodSpecWarning && (
        <section className="shrink-0" data-testid="god-spec-warning">
          <Alert variant="warning" title="God Spec Detected">
            <p className="m-0 mb-2">This spec may be too large. Consider splitting it.</p>
            {godSpecIndicators?.estimatedStories !== undefined && (
              <p className="m-0 mb-2 font-semibold">
                Estimated stories: {godSpecIndicators.estimatedStories}
              </p>
            )}
            {godSpecIndicators?.indicators && godSpecIndicators.indicators.length > 0 && (
              <ul className="mt-2 mb-0 pl-5">
                {godSpecIndicators.indicators.map((indicator, idx) => (
                  <li key={idx} className="my-1">{indicator}</li>
                ))}
              </ul>
            )}
          </Alert>
        </section>
      )}

      {/* Suggestions Section */}
      <section className="flex-1 min-h-[150px] flex flex-col" data-testid="suggestions-area">
        <h3 className="m-0 mb-3 text-sm text-base-content uppercase tracking-wide">Suggestions</h3>
        {hasResult && reviewResult.suggestions.length > 0 ? (
          <div className="flex-1 overflow-y-auto" data-testid="suggestions-list">
            <p className="text-base-content/60 text-sm">
              {reviewResult.suggestions.length} suggestion(s) available
            </p>
          </div>
        ) : (
          <p className="text-base-content/60 italic text-sm">No suggestions available</p>
        )}
      </section>

      {/* Chat Section */}
      <section className="shrink-0 flex flex-col min-h-[200px]" data-testid="chat-area">
        <h3 className="m-0 mb-3 text-sm text-base-content uppercase tracking-wide">Chat</h3>
        <div className="flex-1 min-h-[100px] max-h-[200px] overflow-y-auto p-3 bg-base-300 rounded-lg mb-2" data-testid="chat-messages">
          <p className="text-base-content/60 italic text-sm m-0">Chat messages will appear here</p>
        </div>
        <div className="shrink-0">
          <textarea
            className="textarea textarea-bordered w-full min-h-[60px] resize-none"
            placeholder="Ask a question about the review..."
            onKeyDown={handleChatKeyDown}
            data-testid="chat-input"
            aria-label="Chat input"
          />
        </div>
      </section>
    </div>
  );
}
