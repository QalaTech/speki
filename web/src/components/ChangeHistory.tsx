import type { ChangeHistoryEntry } from '../../../src/types/index.js';

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
    <div className="flex flex-col h-full bg-surface border border-border rounded-lg overflow-hidden" data-testid="change-history">
      <div className="flex items-center justify-between py-3 px-4 border-b border-border bg-surface-hover">
        <h3 className="m-0 text-sm font-semibold text-text">Change History</h3>
        {hasUnrevertedChanges && (
          <button
            type="button"
            className="py-1.5 px-3 border border-red-500 rounded bg-surface text-xs font-medium text-red-500 cursor-pointer transition-all duration-150 hover:bg-red-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/25"
            onClick={() => onRevertAll?.()}
            data-testid="revert-all-button"
          >
            Revert All
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="flex items-center justify-center flex-1 p-6 text-[13px] text-text-muted text-center" data-testid="change-history-empty">
          No changes have been applied yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2" data-testid="change-list">
          {changes.map((change) => (
            <div
              key={change.id}
              className={`flex flex-col p-3 mb-2 last:mb-0 border border-border rounded-md bg-surface gap-2 border-l-[3px] ${change.reverted ? 'bg-surface-hover border-l-text-muted opacity-70' : 'border-l-green-600'}`}
              data-testid="change-item"
              data-change-id={change.id}
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[11px] text-text-muted font-mono" data-testid="change-timestamp">
                  {formatTimestamp(change.timestamp)}
                </span>
                <span className="text-xs font-medium text-text py-0.5 px-1.5 bg-surface-hover rounded" data-testid="change-section">
                  {extractSection(change.filePath)}
                </span>
                {change.reverted && (
                  <span className="text-[11px] font-medium text-yellow-700 bg-yellow-100 py-0.5 px-1.5 rounded uppercase tracking-wide" data-testid="change-reverted-badge">
                    Reverted
                  </span>
                )}
              </div>

              <div className="text-[13px] text-text leading-snug" data-testid="change-description">
                {change.description}
              </div>

              {!change.reverted && (
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    className="py-1 px-2.5 border border-text-muted rounded bg-surface text-xs text-text-muted cursor-pointer transition-all duration-150 hover:bg-text-muted hover:text-white focus:outline-none focus:ring-2 focus:ring-text-muted/25"
                    onClick={() => onRevert?.(change.id)}
                    data-testid="revert-button"
                  >
                    Revert
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
