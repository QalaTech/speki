import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionsPanel } from '../SuggestionsPanel';
import type { Suggestion } from '../../../../../components/specs/types';

describe('SuggestionsPanel', () => {
  const mockSuggestions: Suggestion[] = [
    {
      id: '1',
      type: 'change',
      severity: 'warning',
      section: 'Section 1',
      issue: 'Issue description',
      suggestedFix: 'Fix description',
      status: 'pending',
    },
    {
      id: '2',
      type: 'comment',
      severity: 'info',
      section: 'Section 2',
      issue: 'Just a comment',
      suggestedFix: 'Consider this',
      status: 'pending',
    },
  ];

  const defaultProps = {
    suggestions: mockSuggestions,
    onReject: vi.fn(),
    onDiscuss: vi.fn(),
  };

  it('should render all suggestions', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    expect(screen.getByText('spec content')).toBeInTheDocument();
    expect(screen.getByText('💡 Recommendation')).toBeInTheDocument();
  });

  it('should show diff view for actionable changes', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    // Actionable change shows diff markers
    expect(screen.getByText('Issue description')).toBeInTheDocument();
    expect(screen.getByText('Fix description')).toBeInTheDocument();
  });

  it('should show recommendation view for non-actionable suggestions', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    expect(screen.getByText('Just a comment')).toBeInTheDocument();
    expect(screen.getByText('Consider this')).toBeInTheDocument();
  });

  it('should call onDiscuss when Discuss button clicked for actionable change', () => {
    const onDiscuss = vi.fn();
    render(<SuggestionsPanel {...defaultProps} onDiscuss={onDiscuss} />);

    const discussButtons = screen.getAllByText('Discuss');
    fireEvent.click(discussButtons[0]);

    expect(onDiscuss).toHaveBeenCalledWith(mockSuggestions[0]);
  });

  it('should call onReject when Dismiss button clicked', () => {
    const onReject = vi.fn();
    render(<SuggestionsPanel {...defaultProps} onReject={onReject} />);

    const dismissButtons = screen.getAllByText('Dismiss');
    fireEvent.click(dismissButtons[0]);

    expect(onReject).toHaveBeenCalledWith('1');
  });

  it('should show section information', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.getByText('Section 2')).toBeInTheDocument();
  });
});
