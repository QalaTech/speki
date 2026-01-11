import type {
  SpecReviewResult,
  SpecReviewVerdict,
  GodSpecIndicators,
} from '../../../src/types/index.js';
import './ReviewPanel.css';

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

function getVerdictClass(verdict: SpecReviewVerdict): string {
  switch (verdict) {
    case 'PASS':
      return 'verdict-pass';
    case 'FAIL':
      return 'verdict-fail';
    case 'NEEDS_IMPROVEMENT':
      return 'verdict-warning';
    case 'SPLIT_RECOMMENDED':
      return 'verdict-split';
    default:
      return 'verdict-unknown';
  }
}

function getVerdictLabel(verdict: SpecReviewVerdict): string {
  switch (verdict) {
    case 'PASS':
      return 'Pass';
    case 'FAIL':
      return 'Fail';
    case 'NEEDS_IMPROVEMENT':
      return 'Needs Improvement';
    case 'SPLIT_RECOMMENDED':
      return 'Split Recommended';
    default:
      return 'Unknown';
  }
}

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

  return (
    <div className="review-panel" data-testid="review-panel">
      {/* Verdict Section */}
      <section className="review-verdict-section" data-testid="verdict-section">
        {isReviewing ? (
          <div className="review-status">
            <span className="review-spinner" aria-hidden="true" />
            <span>Reviewing...</span>
          </div>
        ) : hasResult ? (
          <div
            className={`review-verdict ${getVerdictClass(reviewResult.verdict)}`}
            data-testid="verdict-display"
          >
            <span className="verdict-label">Verdict:</span>
            <span className="verdict-value">{getVerdictLabel(reviewResult.verdict)}</span>
          </div>
        ) : (
          <div className="review-empty" data-testid="verdict-empty">
            <span>No review results yet</span>
          </div>
        )}
      </section>

      {/* God Spec Warning Section */}
      {showGodSpecWarning && (
        <section className="god-spec-warning-section" data-testid="god-spec-warning">
          <div className="god-spec-warning">
            <h3>God Spec Detected</h3>
            <p>This spec may be too large. Consider splitting it.</p>
            {godSpecIndicators?.estimatedStories !== undefined && (
              <p className="god-spec-estimate">
                Estimated stories: {godSpecIndicators.estimatedStories}
              </p>
            )}
            {godSpecIndicators?.indicators && godSpecIndicators.indicators.length > 0 && (
              <ul className="god-spec-indicators">
                {godSpecIndicators.indicators.map((indicator, idx) => (
                  <li key={idx}>{indicator}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Suggestions Section */}
      <section className="suggestions-section" data-testid="suggestions-area">
        <h3>Suggestions</h3>
        {hasResult && reviewResult.suggestions.length > 0 ? (
          <div className="suggestions-list" data-testid="suggestions-list">
            {/* Suggestion cards will be rendered by SuggestionCard component */}
            <p className="suggestions-placeholder">
              {reviewResult.suggestions.length} suggestion(s) available
            </p>
          </div>
        ) : (
          <p className="no-suggestions">No suggestions available</p>
        )}
      </section>

      {/* Chat Section */}
      <section className="chat-section" data-testid="chat-area">
        <h3>Chat</h3>
        <div className="chat-messages" data-testid="chat-messages">
          {/* Chat messages will be rendered by ReviewChat component */}
          <p className="chat-placeholder">Chat messages will appear here</p>
        </div>
        <div className="chat-input-container">
          <textarea
            className="chat-input"
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
