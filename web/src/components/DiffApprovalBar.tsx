/**
 * DiffApprovalBar component - displays approve/reject/edit buttons when in diff view mode.
 * Shown when viewing a suggestion's diff and allows user to take action.
 */


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

  const buttonBase = "py-1.5 px-4 text-[13px] font-medium border-none rounded cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]";

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div 
        className="flex items-center justify-between py-2 px-4 bg-gradient-to-r from-[#1e3a5f] to-[#2a4a6e] border-b border-[#3a5a7e] shadow-sm"
        style={{ animation: 'slideDown 0.2s ease-out' }}
        data-testid="diff-approval-bar"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[13px] font-medium text-[#a0c4e8] whitespace-nowrap">Reviewing change:</span>
          {suggestionIssue && (
            <span className="text-[13px] text-white overflow-hidden text-ellipsis whitespace-nowrap max-w-[400px]" data-testid="diff-approval-issue">
              {suggestionIssue}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className={`${buttonBase} bg-green-500 text-white hover:bg-green-600`}
            onClick={onApprove}
            disabled={isLoading}
            data-testid="approve-button"
          >
            {isLoading ? 'Applying...' : 'Approve'}
          </button>

          <button
            type="button"
            className={`${buttonBase} bg-red-500 text-white hover:bg-red-600`}
            onClick={onReject}
            disabled={isLoading}
            data-testid="reject-button"
          >
            Reject
          </button>

          <button
            type="button"
            className={`${buttonBase} bg-primary text-white hover:bg-primary-hover`}
            onClick={onEdit}
            disabled={isLoading}
            data-testid="edit-button"
          >
            Edit
          </button>

          {onCancel && (
            <button
              type="button"
              className={`${buttonBase} bg-gray-500 text-white hover:bg-gray-600`}
              onClick={onCancel}
              disabled={isLoading}
              data-testid="cancel-button"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}
