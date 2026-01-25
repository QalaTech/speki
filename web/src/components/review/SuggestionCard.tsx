import type { SuggestionCard as SuggestionCardType } from '../../../../src/types/index.js';
import { Badge } from '../ui';

export interface SuggestionCardProps {
  suggestion: SuggestionCardType;
  onReviewDiff?: (suggestionId: string) => void;
  onDiscuss?: (suggestionId: string) => void;
  onShowInEditor?: (suggestionId: string) => void;
  onDismiss?: (suggestionId: string) => void;
}

const SEVERITY_CONFIG: Record<string, { label: string; variant: 'error' | 'warning' | 'info' | 'neutral'; borderColor: string }> = {
  critical: { label: 'Critical', variant: 'error', borderColor: 'border-l-error' },
  warning: { label: 'Warning', variant: 'warning', borderColor: 'border-l-warning' },
  info: { label: 'Info', variant: 'info', borderColor: 'border-l-info' },
  unknown: { label: 'Unknown', variant: 'neutral', borderColor: 'border-l-base-300' },
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'error' | 'info'; cardBg: string }> = {
  approved: { label: '✓ Approved', variant: 'success', cardBg: 'opacity-80 bg-success/5' },
  rejected: { label: '✗ Rejected', variant: 'error', cardBg: 'opacity-60 bg-error/5' },
  edited: { label: '✎ Edited', variant: 'info', cardBg: 'opacity-80 bg-info/5' },
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
  const severityConfig = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.unknown;

  let location: string;
  if (lineStart !== undefined && lineEnd !== undefined) {
    location = `${section} (lines ${lineStart}-${lineEnd})`;
  } else if (lineStart !== undefined) {
    location = `${section} (line ${lineStart})`;
  } else {
    location = section;
  }

  const isPending = status === 'pending';
  const statusConfig = STATUS_CONFIG[status];

  return (
    <div
      className={`card card-compact bg-base-200 border border-base-300 mb-3 border-l-4 ${severityConfig.borderColor} ${statusConfig?.cardBg || ''}`}
      data-testid="suggestion-card"
      data-suggestion-id={id}
    >
      <div className="card-body gap-2.5">
        {/* Header with severity and status badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={severityConfig.variant} size="sm" data-testid="severity-indicator">
            {severityConfig.label}
          </Badge>
          <span className="text-xs opacity-60" data-testid="suggestion-location">
            {location}
          </span>
          {!isPending && statusConfig && (
            <Badge variant={statusConfig.variant} size="sm" className="ml-auto" data-testid="status-badge">
              {statusConfig.label}
            </Badge>
          )}
        </div>

        {/* Issue description */}
        <div className="text-sm leading-relaxed" data-testid="suggestion-issue">
          {issue}
        </div>

        {/* Suggested fix preview */}
        <div className="bg-base-300 rounded-lg p-3 text-sm" data-testid="suggestion-preview">
          <div className="font-semibold opacity-60 mb-1">
            {isChangeType ? 'Suggested fix:' : 'Comment:'}
          </div>
          <div className="whitespace-pre-wrap break-words leading-snug">{suggestedFix}</div>
        </div>

        {/* Action buttons */}
        {isPending && (
          <div className="card-actions justify-start mt-1" data-testid="suggestion-actions">
            {isChangeType ? (
              <button
                type="button"
                className="btn btn-glass-primary btn-sm"
                onClick={() => onReviewDiff?.(id)}
                data-testid="review-diff-button"
              >
                Review Diff
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onDiscuss?.(id)}
                data-testid="discuss-button"
              >
                Discuss
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onShowInEditor?.(id)}
              data-testid="show-in-editor-button"
            >
              Show in Editor
            </button>
            <button
              type="button"
              className="btn btn-outline btn-error btn-sm"
              onClick={() => onDismiss?.(id)}
              data-testid="dismiss-button"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
