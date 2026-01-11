import type { SuggestionCard as SuggestionCardType, SuggestionSeverity } from '../../../src/types/index.js';
import './SuggestionCard.css';

export interface SuggestionCardProps {
  suggestion: SuggestionCardType;
  onReviewDiff?: (suggestionId: string) => void;
  onShowInEditor?: (suggestionId: string) => void;
  onDismiss?: (suggestionId: string) => void;
}

const SEVERITY_CONFIG: Record<SuggestionSeverity, { class: string; label: string }> = {
  critical: { class: 'severity-critical', label: 'Critical' },
  warning: { class: 'severity-warning', label: 'Warning' },
  info: { class: 'severity-info', label: 'Info' },
};

const STATUS_LABELS: Record<string, string> = {
  approved: '✓ Approved',
  rejected: '✗ Rejected',
  edited: '✎ Edited',
};

export function SuggestionCard({
  suggestion,
  onReviewDiff,
  onShowInEditor,
  onDismiss,
}: SuggestionCardProps) {
  const { section, lineStart, lineEnd, severity, id, issue, suggestedFix, status } = suggestion;
  const { class: severityClass, label: severityLabel } = SEVERITY_CONFIG[severity] || {
    class: 'severity-unknown',
    label: 'Unknown'
  };

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

  return (
    <div
      className={`suggestion-card ${severityClass} ${!isPending ? `status-${status}` : ''}`}
      data-testid="suggestion-card"
      data-suggestion-id={id}
    >
      <div className="suggestion-header">
        <span className={`severity-indicator ${severityClass}`} data-testid="severity-indicator">
          {severityLabel}
        </span>
        <span className="suggestion-location" data-testid="suggestion-location">
          {location}
        </span>
        {!isPending && (
          <span className={`status-badge status-${status}`} data-testid="status-badge">
            {statusLabel}
          </span>
        )}
      </div>

      <div className="suggestion-issue" data-testid="suggestion-issue">
        {issue}
      </div>

      <div className="suggestion-preview" data-testid="suggestion-preview">
        <div className="preview-label">Suggested fix:</div>
        <div className="preview-content">{suggestedFix}</div>
      </div>

      {isPending && (
        <div className="suggestion-actions" data-testid="suggestion-actions">
          <button
            type="button"
            className="action-button review-diff-button"
            onClick={() => onReviewDiff?.(id)}
            data-testid="review-diff-button"
          >
            Review Diff
          </button>
          <button
            type="button"
            className="action-button show-in-editor-button"
            onClick={() => onShowInEditor?.(id)}
            data-testid="show-in-editor-button"
          >
            Show in Editor
          </button>
          <button
            type="button"
            className="action-button dismiss-button"
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
