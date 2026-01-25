import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@test/render';
import { DiffApprovalBar } from '../review/DiffApprovalBar';

describe('DiffApprovalBar', () => {
  describe('diffApproval_ShowsSideBySide', () => {
    it('should render when isVisible is true', () => {
      render(
        <DiffApprovalBar
          isVisible={true}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(screen.getByTestId('diff-approval-bar')).toBeInTheDocument();
    });

    it('should not render when isVisible is false', () => {
      render(
        <DiffApprovalBar
          isVisible={false}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(screen.queryByTestId('diff-approval-bar')).not.toBeInTheDocument();
    });

    it('should display suggestion issue when provided', () => {
      const issueText = 'Missing acceptance criteria';
      render(
        <DiffApprovalBar
          isVisible={true}
          suggestionIssue={issueText}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(screen.getByTestId('diff-approval-issue')).toHaveTextContent(issueText);
    });
  });

  describe('diffApproval_ApproveAppliesChange', () => {
    it('should call onApprove when Approve button is clicked', () => {
      const onApprove = vi.fn();
      render(
        <DiffApprovalBar
          isVisible={true}
          onApprove={onApprove}
          onReject={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('approve-button'));
      expect(onApprove).toHaveBeenCalledTimes(1);
    });

    it('should show loading state when isLoading is true', () => {
      render(
        <DiffApprovalBar
          isVisible={true}
          isLoading={true}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(screen.getByTestId('approve-button')).toHaveTextContent('Applying...');
      expect(screen.getByTestId('approve-button')).toBeDisabled();
    });

    it('should disable buttons when loading', () => {
      render(
        <DiffApprovalBar
          isVisible={true}
          isLoading={true}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(screen.getByTestId('approve-button')).toBeDisabled();
      expect(screen.getByTestId('reject-button')).toBeDisabled();
      expect(screen.getByTestId('edit-button')).toBeDisabled();
    });
  });

  describe('diffApproval_RejectDiscards', () => {
    it('should call onReject when Reject button is clicked', () => {
      const onReject = vi.fn();
      render(
        <DiffApprovalBar
          isVisible={true}
          onApprove={vi.fn()}
          onReject={onReject}
          onEdit={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('reject-button'));
      expect(onReject).toHaveBeenCalledTimes(1);
    });
  });

  describe('diffApproval_EditAllowsModification', () => {
    it('should call onEdit when Edit button is clicked', () => {
      const onEdit = vi.fn();
      render(
        <DiffApprovalBar
          isVisible={true}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={onEdit}
        />
      );

      fireEvent.click(screen.getByTestId('edit-button'));
      expect(onEdit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cancel button', () => {
    it('should render cancel button when onCancel is provided', () => {
      render(
        <DiffApprovalBar
          isVisible={true}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
    });

    it('should not render cancel button when onCancel is not provided', () => {
      render(
        <DiffApprovalBar
          isVisible={true}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(screen.queryByTestId('cancel-button')).not.toBeInTheDocument();
    });

    it('should call onCancel when Cancel button is clicked', () => {
      const onCancel = vi.fn();
      render(
        <DiffApprovalBar
          isVisible={true}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
