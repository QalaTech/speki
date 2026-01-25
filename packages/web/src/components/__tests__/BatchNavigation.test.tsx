import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@test/render';
import { BatchNavigation, BatchNavigationProps } from '../review/BatchNavigation';
import type { SuggestionCard } from '@speki/core';

function createMockSuggestion(overrides?: Partial<SuggestionCard>): SuggestionCard {
  return {
    id: `sug-${Math.random().toString(36).substring(7)}`,
    category: 'clarity',
    severity: 'warning',
    section: 'Overview',
    lineStart: 10,
    textSnippet: 'Some text',
    issue: 'Test issue',
    suggestedFix: 'Test fix',
    status: 'pending',
    ...overrides,
  };
}

function createDefaultProps(overrides?: Partial<BatchNavigationProps>): BatchNavigationProps {
  return {
    suggestions: [createMockSuggestion(), createMockSuggestion(), createMockSuggestion()],
    currentIndex: 0,
    onNavigate: vi.fn(),
    onApproveAll: vi.fn(),
    onRejectAll: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

describe('BatchNavigation', () => {
  let mockOnNavigate: ReturnType<typeof vi.fn>;
  let mockOnApproveAll: ReturnType<typeof vi.fn>;
  let mockOnRejectAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnNavigate = vi.fn();
    mockOnApproveAll = vi.fn();
    mockOnRejectAll = vi.fn();
  });

  describe('batchNav_NavigatesPreviousNext', () => {
    it('should render Previous and Next buttons', () => {
      const props = createDefaultProps({ currentIndex: 1 });
      render(<BatchNavigation {...props} />);

      expect(screen.getByTestId('prev-btn')).toBeInTheDocument();
      expect(screen.getByTestId('next-btn')).toBeInTheDocument();
    });

    it('should call onNavigate with previous index when Previous is clicked', () => {
      const props = createDefaultProps({
        currentIndex: 2,
        onNavigate: mockOnNavigate,
      });
      render(<BatchNavigation {...props} />);

      fireEvent.click(screen.getByTestId('prev-btn'));

      expect(mockOnNavigate).toHaveBeenCalledTimes(1);
      expect(mockOnNavigate).toHaveBeenCalledWith(1);
    });

    it('should call onNavigate with next index when Next is clicked', () => {
      const props = createDefaultProps({
        currentIndex: 0,
        onNavigate: mockOnNavigate,
      });
      render(<BatchNavigation {...props} />);

      fireEvent.click(screen.getByTestId('next-btn'));

      expect(mockOnNavigate).toHaveBeenCalledTimes(1);
      expect(mockOnNavigate).toHaveBeenCalledWith(1);
    });

    it('should disable Previous button when at first suggestion', () => {
      const props = createDefaultProps({ currentIndex: 0 });
      render(<BatchNavigation {...props} />);

      const prevBtn = screen.getByTestId('prev-btn');
      expect(prevBtn).toBeDisabled();
    });

    it('should disable Next button when at last suggestion', () => {
      const props = createDefaultProps({ currentIndex: 2 });
      render(<BatchNavigation {...props} />);

      const nextBtn = screen.getByTestId('next-btn');
      expect(nextBtn).toBeDisabled();
    });
  });

  describe('batchNav_ShowsCounter', () => {
    it('should display counter with correct position', () => {
      const props = createDefaultProps({ currentIndex: 0 });
      render(<BatchNavigation {...props} />);

      const counter = screen.getByTestId('nav-counter');
      expect(counter).toHaveTextContent('Suggestion 1 of 3');
    });

    it('should update counter when navigating to different suggestions', () => {
      const props = createDefaultProps({ currentIndex: 1 });
      render(<BatchNavigation {...props} />);

      const counter = screen.getByTestId('nav-counter');
      expect(counter).toHaveTextContent('Suggestion 2 of 3');
    });

    it('should display correct counter for last suggestion', () => {
      const props = createDefaultProps({ currentIndex: 2 });
      render(<BatchNavigation {...props} />);

      const counter = screen.getByTestId('nav-counter');
      expect(counter).toHaveTextContent('Suggestion 3 of 3');
    });
  });

  describe('batchNav_ApproveAllAppliesAll', () => {
    it('should render Approve All button', () => {
      const props = createDefaultProps();
      render(<BatchNavigation {...props} />);

      expect(screen.getByTestId('approve-all-btn')).toBeInTheDocument();
      expect(screen.getByTestId('approve-all-btn')).toHaveTextContent('Approve All');
    });

    it('should call onApproveAll when Approve All is clicked', () => {
      const props = createDefaultProps({ onApproveAll: mockOnApproveAll });
      render(<BatchNavigation {...props} />);

      fireEvent.click(screen.getByTestId('approve-all-btn'));

      expect(mockOnApproveAll).toHaveBeenCalledTimes(1);
    });

    it('should disable Approve All button when disabled prop is true', () => {
      const props = createDefaultProps({ disabled: true });
      render(<BatchNavigation {...props} />);

      expect(screen.getByTestId('approve-all-btn')).toBeDisabled();
    });
  });

  describe('batchNav_RejectAllRejectsAll', () => {
    it('should render Reject All button', () => {
      const props = createDefaultProps();
      render(<BatchNavigation {...props} />);

      expect(screen.getByTestId('reject-all-btn')).toBeInTheDocument();
      expect(screen.getByTestId('reject-all-btn')).toHaveTextContent('Reject All');
    });

    it('should call onRejectAll when Reject All is clicked', () => {
      const props = createDefaultProps({ onRejectAll: mockOnRejectAll });
      render(<BatchNavigation {...props} />);

      fireEvent.click(screen.getByTestId('reject-all-btn'));

      expect(mockOnRejectAll).toHaveBeenCalledTimes(1);
    });

    it('should disable Reject All button when disabled prop is true', () => {
      const props = createDefaultProps({ disabled: true });
      render(<BatchNavigation {...props} />);

      expect(screen.getByTestId('reject-all-btn')).toBeDisabled();
    });
  });

  describe('Edge cases', () => {
    it('should return null when suggestions array is empty', () => {
      const props = createDefaultProps({ suggestions: [] });
      const { container } = render(<BatchNavigation {...props} />);

      expect(container.firstChild).toBeNull();
    });

    it('should disable all buttons when disabled is true', () => {
      const props = createDefaultProps({
        currentIndex: 1,
        disabled: true,
      });
      render(<BatchNavigation {...props} />);

      expect(screen.getByTestId('prev-btn')).toBeDisabled();
      expect(screen.getByTestId('next-btn')).toBeDisabled();
      expect(screen.getByTestId('approve-all-btn')).toBeDisabled();
      expect(screen.getByTestId('reject-all-btn')).toBeDisabled();
    });
  });
});
