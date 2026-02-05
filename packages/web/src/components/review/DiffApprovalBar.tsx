/**
 * DiffApprovalBar component - displays approve/reject/edit buttons when in diff view mode.
 * Shown when viewing a suggestion's diff and allows user to take action.
 */
import { Button } from '../ui/Button';

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
      className="flex items-center justify-between py-2 px-4 bg-secondary border-b border-border shadow-sm animate-diff-bar"
      data-testid="diff-approval-bar"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Reviewing change:</span>
        {suggestionIssue && (
          <span className="text-sm text-foreground overflow-hidden text-ellipsis whitespace-nowrap max-w-[400px]" data-testid="diff-approval-issue">
            {suggestionIssue}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0" data-testid="diff-approval-buttons">
        <Button
          variant="primary"
          onClick={onApprove}
          disabled={isLoading}
          size="sm"
          className="whitespace-nowrap h-8"
          data-testid="approve-button"
          isLoading={isLoading}
          loadingText="Applying..."
        >
          Approve
        </Button>
        <Button
          variant="destructive"
          onClick={onReject}
          disabled={isLoading}
          size="sm"
          className="whitespace-nowrap h-8"
          data-testid="reject-button"
        >
          Reject
        </Button>
        <Button
          variant="primary"
          onClick={onEdit}
          disabled={isLoading}
          size="sm"
          className="whitespace-nowrap h-8"
          data-testid="edit-button"
        >
          Edit
        </Button>
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
            size="sm"
            className="whitespace-nowrap h-8"
            data-testid="cancel-button"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
