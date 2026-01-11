import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionCard } from '../SuggestionCard';
import type { SuggestionCard as SuggestionCardType } from '../../../../src/types/index.js';

function mockSuggestion(overrides: Partial<SuggestionCardType> = {}): SuggestionCardType {
  return {
    id: 'sug-1',
    category: 'clarity',
    severity: 'warning',
    section: 'Requirements',
    textSnippet: 'The system shall...',
    issue: 'Requirement is ambiguous',
    suggestedFix: 'Add specific metrics to clarify the requirement',
    status: 'pending',
    ...overrides,
  };
}

describe('SuggestionCard', () => {
  describe('SuggestionCard_DisplaysIssue', () => {
    it('should display issue description', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ issue: 'Requirement is ambiguous and lacks specifics' })} />);
      expect(screen.getByTestId('suggestion-issue')).toHaveTextContent('Requirement is ambiguous and lacks specifics');
    });

    it('should display section location', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ section: 'Functional Requirements' })} />);
      expect(screen.getByTestId('suggestion-location')).toHaveTextContent('Functional Requirements');
    });

    it('should display line numbers when provided', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ section: 'Requirements', lineStart: 10, lineEnd: 15 })} />);
      expect(screen.getByTestId('suggestion-location')).toHaveTextContent('Requirements (lines 10-15)');
    });

    it('should display single line number when only start provided', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ section: 'Requirements', lineStart: 42 })} />);
      expect(screen.getByTestId('suggestion-location')).toHaveTextContent('Requirements (line 42)');
    });

    it('should display preview of suggested fix', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ suggestedFix: 'Replace with: "The system shall respond within 200ms"' })} />);
      expect(screen.getByTestId('suggestion-preview')).toHaveTextContent('Replace with: "The system shall respond within 200ms"');
    });
  });

  describe('SuggestionCard_ShowsSeverity', () => {
    it.each([
      ['critical', 'Critical'],
      ['warning', 'Warning'],
      ['info', 'Info'],
    ] as const)('should display %s severity indicator', (severity, label) => {
      render(<SuggestionCard suggestion={mockSuggestion({ severity })} />);
      const indicator = screen.getByTestId('severity-indicator');
      expect(indicator).toHaveTextContent(label);
      expect(indicator).toHaveClass(`severity-${severity}`);
    });

    it('should apply severity class to card', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ severity: 'critical' })} />);
      expect(screen.getByTestId('suggestion-card')).toHaveClass('severity-critical');
    });
  });

  describe('SuggestionCard_ReviewDiffTriggersDiff', () => {
    it('should render Review Diff button', () => {
      render(<SuggestionCard suggestion={mockSuggestion()} />);
      expect(screen.getByText('Review Diff')).toBeInTheDocument();
    });

    it('should call onReviewDiff with suggestion id when clicked', () => {
      const onReviewDiff = vi.fn();
      render(<SuggestionCard suggestion={mockSuggestion({ id: 'sug-123' })} onReviewDiff={onReviewDiff} />);
      fireEvent.click(screen.getByTestId('review-diff-button'));
      expect(onReviewDiff).toHaveBeenCalledWith('sug-123');
    });

    it('should not throw when onReviewDiff is not provided', () => {
      render(<SuggestionCard suggestion={mockSuggestion()} />);
      expect(() => fireEvent.click(screen.getByTestId('review-diff-button'))).not.toThrow();
    });
  });

  describe('SuggestionCard_ShowInEditorScrolls', () => {
    it('should render Show in Editor button', () => {
      render(<SuggestionCard suggestion={mockSuggestion()} />);
      expect(screen.getByText('Show in Editor')).toBeInTheDocument();
    });

    it('should call onShowInEditor with suggestion id when clicked', () => {
      const onShowInEditor = vi.fn();
      render(<SuggestionCard suggestion={mockSuggestion({ id: 'sug-456' })} onShowInEditor={onShowInEditor} />);
      fireEvent.click(screen.getByTestId('show-in-editor-button'));
      expect(onShowInEditor).toHaveBeenCalledWith('sug-456');
    });

    it('should not throw when onShowInEditor is not provided', () => {
      render(<SuggestionCard suggestion={mockSuggestion()} />);
      expect(() => fireEvent.click(screen.getByTestId('show-in-editor-button'))).not.toThrow();
    });
  });

  describe('SuggestionCard_DismissRejects', () => {
    it('should render Dismiss button', () => {
      render(<SuggestionCard suggestion={mockSuggestion()} />);
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });

    it('should call onDismiss with suggestion id when clicked', () => {
      const onDismiss = vi.fn();
      render(<SuggestionCard suggestion={mockSuggestion({ id: 'sug-789' })} onDismiss={onDismiss} />);
      fireEvent.click(screen.getByTestId('dismiss-button'));
      expect(onDismiss).toHaveBeenCalledWith('sug-789');
    });

    it('should not throw when onDismiss is not provided', () => {
      render(<SuggestionCard suggestion={mockSuggestion()} />);
      expect(() => fireEvent.click(screen.getByTestId('dismiss-button'))).not.toThrow();
    });
  });

  describe('liveUpdate_UpdatesCardStatus', () => {
    it('should display approved badge when status is approved', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ status: 'approved' })} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('✓ Approved');
      expect(badge).toHaveClass('status-approved');
    });

    it('should display rejected badge when status is rejected', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ status: 'rejected' })} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('✗ Rejected');
      expect(badge).toHaveClass('status-rejected');
    });

    it('should display edited badge when status is edited', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ status: 'edited' })} />);
      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveTextContent('✎ Edited');
      expect(badge).toHaveClass('status-edited');
    });

    it('should not display status badge when status is pending', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ status: 'pending' })} />);
      expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument();
    });

    it('should hide action buttons when status is not pending', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ status: 'approved' })} />);
      expect(screen.queryByTestId('suggestion-actions')).not.toBeInTheDocument();
      expect(screen.queryByTestId('review-diff-button')).not.toBeInTheDocument();
    });

    it('should show action buttons when status is pending', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ status: 'pending' })} />);
      expect(screen.getByTestId('suggestion-actions')).toBeInTheDocument();
      expect(screen.getByTestId('review-diff-button')).toBeInTheDocument();
    });

    it('should apply status class to card when not pending', () => {
      render(<SuggestionCard suggestion={mockSuggestion({ status: 'approved' })} />);
      expect(screen.getByTestId('suggestion-card')).toHaveClass('status-approved');
    });
  });
});
