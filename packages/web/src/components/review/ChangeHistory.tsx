import type { ChangeHistoryEntry } from '@speki/core';
import { Badge } from '../ui';

export interface ChangeHistoryProps {
  changes: ChangeHistoryEntry[];
  onRevert?: (changeId: string) => void;
  onRevertAll?: () => void;
}

/**
 * Formats an ISO timestamp for display.
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Extracts the section name from a file path.
 */
function extractSection(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath;
  return filename.replace(/\.(md|txt|spec)$/i, '');
}

export function ChangeHistory({
  changes,
  onRevert,
  onRevertAll,
}: ChangeHistoryProps) {
  const unrevertedChanges = changes.filter((c) => !c.reverted);
  const hasUnrevertedChanges = unrevertedChanges.length > 0;

  return (
    <div className="flex flex-col h-full bg-base-200 border border-base-300 rounded-lg overflow-hidden" data-testid="change-history">
      <div className="flex items-center justify-between py-3 px-4 border-b border-base-300 bg-base-300">
        <h3 className="m-0 text-sm font-semibold">Change History</h3>
        {hasUnrevertedChanges && (
          <button
            type="button"
            className="btn btn-outline btn-error btn-xs"
            onClick={() => onRevertAll?.()}
            data-testid="revert-all-button"
          >
            Revert All
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="flex items-center justify-center flex-1 p-6 text-sm opacity-60 text-center" data-testid="change-history-empty">
          No changes have been applied yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2" data-testid="change-list">
          {changes.map((change) => (
            <div
              key={change.id}
              className={`card card-compact bg-base-200 border border-base-300 mb-2 last:mb-0 border-l-4 ${change.reverted ? 'bg-base-300 border-l-base-content/30 opacity-70 reverted' : 'border-l-success'}`}
              data-testid="change-item"
              data-change-id={change.id}
            >
              <div className="card-body gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs opacity-60 font-mono" data-testid="change-timestamp">
                    {formatTimestamp(change.timestamp)}
                  </span>
                  <Badge variant="neutral" size="xs" data-testid="change-section">
                    {extractSection(change.filePath)}
                  </Badge>
                  {change.reverted && (
                    <Badge variant="warning" size="xs" data-testid="change-reverted-badge">
                      Reverted
                    </Badge>
                  )}
                </div>

                <div className="text-sm leading-snug" data-testid="change-description">
                  {change.description}
                </div>

                {!change.reverted && (
                  <div className="card-actions justify-start mt-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => onRevert?.(change.id)}
                      data-testid="revert-button"
                    >
                      Revert
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
