import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@test/render';
import { ReviewPanel } from '../ReviewPanel';
import type { Suggestion } from '../../../../../components/specs/types';

function mockSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'sug-1',
    type: 'change',
    severity: 'warning',
    section: 'Requirements',
    issue: 'Requirement is ambiguous',
    suggestedFix: 'Add specific metrics to clarify',
    status: 'pending',
    tags: ['api'],
    ...overrides,
  };
}

describe('ReviewPanel', () => {
  const defaultProps = {
    suggestions: [],
    onResolve: vi.fn(),
    onDismiss: vi.fn(),
    onDiscuss: vi.fn(),
    onDismissAll: vi.fn(),
    onClose: vi.fn(),
  };

  describe('empty state', () => {
    it('should render empty state when no pending suggestions', () => {
      render(<ReviewPanel {...defaultProps} suggestions={[]} />);
      
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByText('All suggestions reviewed ✓')).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked in empty state', () => {
      const onClose = vi.fn();
      render(<ReviewPanel {...defaultProps} suggestions={[]} onClose={onClose} />);
      
      const closeButton = screen.getByRole('button');
      fireEvent.click(closeButton);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('with suggestions', () => {
    it('should render suggestion issue text', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', issue: 'This needs improvement' }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('This needs improvement')).toBeInTheDocument();
    });

    it('should render section location', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', section: 'Functional Requirements' }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('Functional Requirements')).toBeInTheDocument();
    });

    it('should render tag icon when tags are present', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', tags: ['security'] }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('🔒')).toBeInTheDocument();
    });

    it('should call onResolve when Resolve button is clicked', () => {
      const onResolve = vi.fn();
      const suggestions = [mockSuggestion({ id: 'sug-123' })];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} onResolve={onResolve} />);
      
      const resolveButton = screen.getByText('Resolve');
      fireEvent.click(resolveButton);
      
      expect(onResolve).toHaveBeenCalledWith('sug-123');
    });

    it('should call onDiscuss when Discuss button is clicked', () => {
      const onDiscuss = vi.fn();
      const suggestion = mockSuggestion({ id: 'sug-456' });
      const suggestions = [suggestion];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} onDiscuss={onDiscuss} />);
      
      const discussButton = screen.getByText('Discuss');
      fireEvent.click(discussButton);
      
      expect(onDiscuss).toHaveBeenCalledWith(suggestion);
    });

    it('should call onDismissAll when Dismiss all is clicked', () => {
      const onDismissAll = vi.fn();
      const suggestions = [mockSuggestion({ id: 'sug-1' })];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} onDismissAll={onDismissAll} />);
      
      const dismissAllButton = screen.getByText('Dismiss all');
      fireEvent.click(dismissAllButton);
      
      expect(onDismissAll).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      const suggestions = [mockSuggestion({ id: 'sug-1' })];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} onClose={onClose} />);
      
      const closeButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('svg')
      );
      if (closeButton) fireEvent.click(closeButton);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should sort suggestions by severity (critical first)', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', severity: 'info', issue: 'Info issue' }),
        mockSuggestion({ id: 'sug-2', severity: 'critical', issue: 'Critical issue' }),
        mockSuggestion({ id: 'sug-3', severity: 'warning', issue: 'Warning issue' }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      const issues = screen.getAllByText(/issue$/);
      expect(issues[0]).toHaveTextContent('Critical issue');
      expect(issues[1]).toHaveTextContent('Warning issue');
      expect(issues[2]).toHaveTextContent('Info issue');
    });

    it('should filter out non-pending suggestions', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', status: 'pending', issue: 'Pending' }),
        mockSuggestion({ id: 'sug-2', status: 'resolved', issue: 'Resolved' }),
        mockSuggestion({ id: 'sug-3', status: 'approved', issue: 'Approved' }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.queryByText('Resolved')).not.toBeInTheDocument();
      expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    });
  });

  describe('expand/collapse functionality', () => {
    it('should show change toggle when suggestion has code fix', () => {
      const suggestions = [
        mockSuggestion({ 
          id: 'sug-1', 
          type: 'change',
          suggestedFix: 'const x = 1;'
        }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('Hide change')).toBeInTheDocument();
    });

    it('should toggle change visibility', () => {
      const suggestions = [
        mockSuggestion({ 
          id: 'sug-1', 
          type: 'change',
          suggestedFix: 'const x = 1;'
        }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('+ const x = 1;')).toBeInTheDocument();
      
      const toggle = screen.getByText('Hide change');
      fireEvent.click(toggle);
      
      expect(screen.getByText('Show change')).toBeInTheDocument();
      expect(screen.queryByText('+ const x = 1;')).not.toBeInTheDocument();
    });

    it('should show suggested fix for comment type with meaningful fix', () => {
      const suggestions = [
        mockSuggestion({ 
          id: 'sug-1', 
          type: 'comment',
          issue: 'Consider adding validation',
          suggestedFix: 'Add input validation here'
        }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('Hide change')).toBeInTheDocument();
    });
  });

  describe('severity styling', () => {
    it('should show critical label for critical severity', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', severity: 'critical' }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('should show Warning label for warning severity', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', severity: 'warning' }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('should show Suggestion label for info severity', () => {
      const suggestions = [
        mockSuggestion({ id: 'sug-1', severity: 'info' }),
      ];
      render(<ReviewPanel {...defaultProps} suggestions={suggestions} />);
      
      expect(screen.getByText('Suggestion')).toBeInTheDocument();
    });
  });
});
