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
      section: 'API Section',
      issue: 'Add rate limiting to prevent abuse',
      suggestedFix: 'Add express-rate-limit middleware',
      status: 'pending',
      tags: ['security', 'api'],
    },
    {
      id: '2',
      type: 'comment',
      severity: 'info',
      section: 'Documentation',
      issue: 'Consider documenting error responses',
      suggestedFix: 'Consider documenting error responses',
      status: 'pending',
      tags: ['documentation'],
    },
    {
      id: '3',
      severity: 'critical',
      issue: 'SQL injection vulnerability detected',
      suggestedFix: 'Use parameterized queries',
      status: 'pending',
    },
  ];

  const defaultProps = {
    suggestions: mockSuggestions,
    onReject: vi.fn(),
    onDiscuss: vi.fn(),
  };

  it('should render header with count', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    expect(screen.getByText('AI Suggestions')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should render all suggestion issues', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    expect(screen.getByText('Add rate limiting to prevent abuse')).toBeInTheDocument();
    expect(screen.getByText('Consider documenting error responses')).toBeInTheDocument();
    expect(screen.getByText('SQL injection vulnerability detected')).toBeInTheDocument();
  });

  it('should show severity count badges in header', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    // Should show count badges for critical and warning (just numbers)
    const countBadges = screen.getAllByText('1');
    expect(countBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('should call onDiscuss when Discuss button is clicked', () => {
    const onDiscuss = vi.fn();
    render(<SuggestionsPanel {...defaultProps} onDiscuss={onDiscuss} />);

    const discussButtons = screen.getAllByText('Discuss');
    fireEvent.click(discussButtons[0]);

    expect(onDiscuss).toHaveBeenCalled();
  });

  it('should call onReject when dismiss icon is clicked', () => {
    const onReject = vi.fn();
    render(<SuggestionsPanel {...defaultProps} onReject={onReject} />);

    // Find the first suggestion and hover to reveal dismiss button
    const firstIssue = screen.getByText('Add rate limiting to prevent abuse');
    const card = firstIssue.closest('.group');
    if (card) {
      fireEvent.mouseEnter(card);
    }

    // Find dismiss button (might be icon only, look by title)
    const dismissButton = screen.getAllByTitle('Dismiss')[0];
    fireEvent.click(dismissButton);

    expect(onReject).toHaveBeenCalled();
  });

  it('should show section information', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    expect(screen.getByText('API Section')).toBeInTheDocument();
    expect(screen.getByText('Documentation')).toBeInTheDocument();
  });

  it('should show expand button only for suggestions with code fixes', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    // Should have "Show change" buttons for actionable suggestions
    const expandButtons = screen.getAllByText('Show change');
    expect(expandButtons.length).toBeGreaterThan(0);
  });

  it('should expand to show the fix when clicked', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    const expandButtons = screen.getAllByText('Show change');
    fireEvent.click(expandButtons[0]);
    
    // Button text should change
    expect(screen.getByText('Hide change')).toBeInTheDocument();
  });

  it('should show Apply button for actionable suggestions', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    // Look for the Apply button (may be multiple)
    const applyButtons = screen.getAllByText('Apply');
    expect(applyButtons.length).toBeGreaterThan(0);
  });

  it('should show dismiss all button in footer', () => {
    const onReject = vi.fn();
    render(<SuggestionsPanel {...defaultProps} onReject={onReject} />);
    
    const dismissAll = screen.getByText('Dismiss all');
    fireEvent.click(dismissAll);
    
    expect(onReject).toHaveBeenCalledTimes(3);
  });

  it('should render severity labels', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('should group suggestions by severity order', () => {
    render(<SuggestionsPanel {...defaultProps} />);
    
    const issues = screen.getAllByText(/Add rate limiting|Consider documenting|SQL injection/);
    // Critical should come first, then warning, then info
    expect(issues[0].textContent).toContain('SQL injection'); // critical
    expect(issues[1].textContent).toContain('Add rate limiting'); // warning
    expect(issues[2].textContent).toContain('Consider documenting'); // info
  });
});
