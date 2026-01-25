/**
 * DiffApprovalBar component - displays approve/reject/edit buttons when in diff view mode.
 * Shown when viewing a suggestion's diff and allows user to take action.
 */
import { ActionButton } from '../ui/ActionButton';

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
    <div
      className="flex items-center justify-between py-2 px-4 bg-info/10 border-b border-info/30 shadow-sm animate-[slideDown_0.2s_ease-out]"
      data-testid="diff-approval-bar"
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm font-medium text-info whitespace-nowrap">Reviewing change:</span>
        {suggestionIssue && (
          <span className="text-sm text-base-content overflow-hidden text-ellipsis whitespace-nowrap max-w-[400px]" data-testid="diff-approval-issue">
            {suggestionIssue}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0" data-testid="diff-approval-buttons">
        <ActionButton
          variant="approve"
          onClick={onApprove}
          disabled={isLoading}
          size="sm"
          className="whitespace-nowrap"
          data-testid="approve-button"
        >
          {isLoading ? 'Applying...' : 'Approve'}
        </ActionButton>

        <ActionButton
          variant="reject"
          onClick={onReject}
          disabled={isLoading}
          size="sm"
          className="whitespace-nowrap"
          data-testid="reject-button"
        >
          Reject
        </ActionButton>

        <ActionButton
          variant="primary"
          onClick={onEdit}
          disabled={isLoading}
          size="sm"
          className="whitespace-nowrap"
          data-testid="edit-button"
        >
          Edit
        </ActionButton>

        {onCancel && (
          <ActionButton
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            size="sm"
            className="whitespace-nowrap"
            data-testid="cancel-button"
          >
            Cancel
          </ActionButton>
        )}
      </div>
    </div>
  );
}
