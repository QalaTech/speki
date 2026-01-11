/**
 * DiffApprovalBar component - displays approve/reject/edit buttons when in diff view mode.
 * Shown when viewing a suggestion's diff and allows user to take action.
 */

import './DiffApprovalBar.css';

export interface DiffApprovalBarProps {
  /** Whether the bar is visible */
  isVisible: boolean;
  /** Suggestion being reviewed (for context display) */
  suggestionIssue?: string;
  /** Whether an action is currently pending */
  isLoading?: boolean;
  /** Callback when Approve is clicked */
  onApprove: () => void;
  /** Callback when Reject is clicked */
  onReject: () => void;
  /** Callback when Edit is clicked (allows modifying before applying) */
  onEdit: () => void;
  /** Callback when Cancel is clicked (exits diff mode without action) */
  onCancel?: () => void;
}

export function DiffApprovalBar({
  isVisible,
  suggestionIssue,
  isLoading = false,
  onApprove,
  onReject,
  onEdit,
  onCancel,
}: DiffApprovalBarProps): React.ReactElement | null {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="diff-approval-bar" data-testid="diff-approval-bar">
      <div className="diff-approval-context">
        <span className="diff-approval-label">Reviewing change:</span>
        {suggestionIssue && (
          <span className="diff-approval-issue" data-testid="diff-approval-issue">
            {suggestionIssue}
          </span>
        )}
      </div>

      <div className="diff-approval-actions">
        <button
          type="button"
          className="diff-action-button approve-button"
          onClick={onApprove}
          disabled={isLoading}
          data-testid="approve-button"
        >
          {isLoading ? 'Applying...' : 'Approve'}
        </button>

        <button
          type="button"
          className="diff-action-button reject-button"
          onClick={onReject}
          disabled={isLoading}
          data-testid="reject-button"
        >
          Reject
        </button>

        <button
          type="button"
          className="diff-action-button edit-button"
          onClick={onEdit}
          disabled={isLoading}
          data-testid="edit-button"
        >
          Edit
        </button>

        {onCancel && (
          <button
            type="button"
            className="diff-action-button cancel-button"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="cancel-button"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
