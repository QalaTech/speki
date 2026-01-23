import type {
  SpecReviewResult,
  SpecReviewVerdict,
  GodSpecIndicators,
} from '../../../src/types/index.js';

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

  const verdictStyles: Record<string, { container: string; badge: string }> = {
    'verdict-pass': { container: '', badge: 'bg-[#d4edda] text-[#155724]' },
    'verdict-fail': { container: '', badge: 'bg-[#f8d7da] text-[#721c24]' },
    'verdict-warning': { container: '', badge: 'bg-[#fff3cd] text-[#856404]' },
    'verdict-split': { container: '', badge: 'bg-[#cce5ff] text-[#004085]' },
    'verdict-unknown': { container: '', badge: 'bg-[#e0e0e0] text-[#666]' },
  };

  const verdictClass = hasResult ? getVerdictClass(reviewResult.verdict) : '';
  const verdictStyle = verdictStyles[verdictClass] || verdictStyles['verdict-unknown'];

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div className="flex flex-col h-full overflow-y-auto p-4 gap-4" data-testid="review-panel">
        {/* Verdict Section */}
        <section className="shrink-0 p-4 bg-bg rounded-lg" data-testid="verdict-section">
          {isReviewing ? (
            <div className="flex items-center gap-2 text-text-muted">
              <span className="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-[spin_1s_linear_infinite]" aria-hidden="true" />
              <span>Reviewing...</span>
            </div>
          ) : hasResult ? (
            <div className="flex items-center gap-2 text-lg font-semibold" data-testid="verdict-display">
              <span className="text-text-muted">Verdict:</span>
              <span className={`py-1 px-3 rounded ${verdictStyle.badge}`}>{getVerdictLabel(reviewResult.verdict)}</span>
            </div>
          ) : (
            <div className="text-text-muted italic" data-testid="verdict-empty">
              <span>No review results yet</span>
            </div>
          )}
        </section>

        {/* God Spec Warning Section */}
        {showGodSpecWarning && (
          <section className="shrink-0" data-testid="god-spec-warning">
            <div className="p-4 bg-[#fff3cd] border border-[#ffc107] rounded-lg text-[#856404]">
              <h3 className="m-0 mb-2 text-base">God Spec Detected</h3>
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
            </div>
          </section>
        )}

        {/* Suggestions Section */}
        <section className="flex-1 min-h-[150px] flex flex-col" data-testid="suggestions-area">
          <h3 className="m-0 mb-3 text-sm text-text uppercase tracking-wide">Suggestions</h3>
          {hasResult && reviewResult.suggestions.length > 0 ? (
            <div className="flex-1 overflow-y-auto" data-testid="suggestions-list">
              <p className="text-text-muted text-sm">
                {reviewResult.suggestions.length} suggestion(s) available
              </p>
            </div>
          ) : (
            <p className="text-text-muted italic text-sm">No suggestions available</p>
          )}
        </section>

        {/* Chat Section */}
        <section className="shrink-0 flex flex-col min-h-[200px]" data-testid="chat-area">
          <h3 className="m-0 mb-3 text-sm text-text uppercase tracking-wide">Chat</h3>
          <div className="flex-1 min-h-[100px] max-h-[200px] overflow-y-auto p-3 bg-bg rounded-lg mb-2" data-testid="chat-messages">
            <p className="text-text-muted italic text-sm m-0">Chat messages will appear here</p>
          </div>
          <div className="shrink-0">
            <textarea
              className="w-full p-3 border border-border rounded-lg text-sm resize-none min-h-[60px] bg-surface text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-text-muted"
              placeholder="Ask a question about the review..."
              onKeyDown={handleChatKeyDown}
              data-testid="chat-input"
              aria-label="Chat input"
            />
          </div>
        </section>
      </div>
    </>
  );
}
