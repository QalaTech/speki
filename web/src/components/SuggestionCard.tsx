import type { SuggestionCard as SuggestionCardType } from '../../../src/types/index.js';

export interface SuggestionCardProps {
  suggestion: SuggestionCardType;
  onReviewDiff?: (suggestionId: string) => void;
  onDiscuss?: (suggestionId: string) => void;
  onShowInEditor?: (suggestionId: string) => void;
  onDismiss?: (suggestionId: string) => void;
}

const SEVERITY_STYLES: Record<string, { label: string; borderColor: string; badgeBg: string; badgeText: string }> = {
  critical: { label: 'Critical', borderColor: 'border-l-red-500', badgeBg: 'bg-red-500/20', badgeText: 'text-red-500' },
  warning: { label: 'Warning', borderColor: 'border-l-yellow-500', badgeBg: 'bg-yellow-500/20', badgeText: 'text-yellow-500' },
  info: { label: 'Info', borderColor: 'border-l-blue-500', badgeBg: 'bg-blue-500/20', badgeText: 'text-blue-500' },
  unknown: { label: 'Unknown', borderColor: 'border-l-text-muted', badgeBg: 'bg-surface-hover', badgeText: 'text-text-muted' },
};;

const STATUS_LABELS: Record<string, string> = {
  approved: '✓ Approved',
  rejected: '✗ Rejected',
  edited: '✎ Edited',
};

const STATUS_STYLES: Record<string, { cardBg: string; badgeBg: string; badgeText: string }> = {
  approved: { cardBg: 'opacity-80 bg-green-500/5', badgeBg: 'bg-green-500/20', badgeText: 'text-green-500' },
  rejected: { cardBg: 'opacity-60 bg-red-500/5', badgeBg: 'bg-red-500/20', badgeText: 'text-red-500' },
  edited: { cardBg: 'opacity-80 bg-blue-500/5', badgeBg: 'bg-blue-500/20', badgeText: 'text-blue-500' },
};

export function SuggestionCard({
  suggestion,
  onReviewDiff,
  onDiscuss,
  onShowInEditor,
  onDismiss,
}: SuggestionCardProps) {
  const { section, lineStart, lineEnd, severity, id, issue, suggestedFix, status, type } = suggestion;
  const isChangeType = type === 'change';
  const { label: severityLabel, borderColor, badgeBg, badgeText } = SEVERITY_STYLES[severity] || SEVERITY_STYLES.unknown;

  let location: string;
  if (lineStart !== undefined && lineEnd !== undefined) {
    location = `${section} (lines ${lineStart}-${lineEnd})`;
  } else if (lineStart !== undefined) {
    location = `${section} (line ${lineStart})`;
  } else {
    location = section;
  }

  const isPending = status === 'pending';
  const statusLabel = STATUS_LABELS[status] || '';
  const statusConfig = STATUS_STYLES[status];

  const cardClasses = `flex flex-col p-3 mb-3 border border-border rounded-lg bg-surface gap-2.5 border-l-4 ${borderColor} ${statusConfig?.cardBg || ''}`;

  return (
    <div
      className={cardClasses}
      data-testid="suggestion-card"
      data-suggestion-id={id}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span 
          className={`inline-block py-0.5 px-2 rounded text-xs font-semibold uppercase tracking-wide ${badgeBg} ${badgeText}`}
          data-testid="severity-indicator"
        >
          {severityLabel}
        </span>
        <span className="text-xs text-text-muted" data-testid="suggestion-location">
          {location}
        </span>
        {!isPending && statusConfig && (
          <span 
            className={`inline-block py-0.5 px-2 rounded text-xs font-semibold ml-auto ${statusConfig.badgeBg} ${statusConfig.badgeText}`}
            data-testid="status-badge"
          >
            {statusLabel}
          </span>
        )}
      </div>

      <div className="text-sm text-text leading-relaxed" data-testid="suggestion-issue">
        {issue}
      </div>

      <div className="py-2 px-3 bg-surface-hover rounded text-[13px]" data-testid="suggestion-preview">
        <div className="font-semibold text-text-muted mb-1">{isChangeType ? 'Suggested fix:' : 'Comment:'}</div>
        <div className="text-text whitespace-pre-wrap break-words leading-snug">{suggestedFix}</div>
      </div>

      {isPending && (
        <div className="flex gap-2 flex-wrap mt-1" data-testid="suggestion-actions">
          {isChangeType ? (
            <button
              type="button"
              className="py-1.5 px-3 border rounded bg-primary border-primary text-white text-[13px] cursor-pointer transition-all duration-150 hover:bg-primary-hover focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              onClick={() => onReviewDiff?.(id)}
              data-testid="review-diff-button"
            >
              Review Diff
            </button>
          ) : (
            <button
              type="button"
              className="py-1.5 px-3 border rounded bg-purple-500 border-purple-500 text-white text-[13px] cursor-pointer transition-all duration-150 hover:bg-purple-600 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              onClick={() => onDiscuss?.(id)}
              data-testid="discuss-button"
            >
              Discuss
            </button>
          )}
          <button
            type="button"
            className="py-1.5 px-3 border border-border rounded bg-surface-hover text-text text-[13px] cursor-pointer transition-all duration-150 hover:bg-surface hover:border-accent focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            onClick={() => onShowInEditor?.(id)}
            data-testid="show-in-editor-button"
          >
            Show in Editor
          </button>
          <button
            type="button"
            className="py-1.5 px-3 border border-red-500 rounded bg-surface text-red-500 text-[13px] cursor-pointer transition-all duration-150 hover:bg-red-500/10 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            onClick={() => onDismiss?.(id)}
            data-testid="dismiss-button"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
