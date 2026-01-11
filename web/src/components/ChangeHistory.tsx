import type { ChangeHistoryEntry } from '../../../src/types/index.js';
import './ChangeHistory.css';

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
    <div className="change-history" data-testid="change-history">
      <div className="change-history-header">
        <h3 className="change-history-title">Change History</h3>
        {hasUnrevertedChanges && (
          <button
            type="button"
            className="revert-all-button"
            onClick={() => onRevertAll?.()}
            data-testid="revert-all-button"
          >
            Revert All
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="change-history-empty" data-testid="change-history-empty">
          No changes have been applied yet.
        </div>
      ) : (
        <div className="change-list" data-testid="change-list">
          {changes.map((change) => (
            <div
              key={change.id}
              className={`change-item ${change.reverted ? 'change-reverted' : ''}`}
              data-testid="change-item"
              data-change-id={change.id}
            >
              <div className="change-item-header">
                <span className="change-timestamp" data-testid="change-timestamp">
                  {formatTimestamp(change.timestamp)}
                </span>
                <span className="change-section" data-testid="change-section">
                  {extractSection(change.filePath)}
                </span>
                {change.reverted && (
                  <span className="change-reverted-badge" data-testid="change-reverted-badge">
                    Reverted
                  </span>
                )}
              </div>

              <div className="change-description" data-testid="change-description">
                {change.description}
              </div>

              {!change.reverted && (
                <div className="change-actions">
                  <button
                    type="button"
                    className="revert-button"
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
