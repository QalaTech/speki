import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from '../StatusBar';

describe('StatusBar', () => {
  const defaultProps = {
    storiesCount: 5,
    isPrd: true,
    tasksVisible: true,
    pendingSuggestionsCount: 0,
    isSuggestionsExpanded: false,
    onScrollToTasks: vi.fn(),
    onToggleSuggestions: vi.fn(),
    onDismissAllSuggestions: vi.fn(),
  };

  it('should return null when no tasks indicator or suggestions', () => {
    const { container } = render(<StatusBar {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('should show tasks below indicator when tasks not visible', () => {
    render(<StatusBar {...defaultProps} tasksVisible={false} />);
    expect(screen.getByText(/5 stories below/i)).toBeInTheDocument();
  });

  it('should show tasks count for non-PRD specs', () => {
    render(<StatusBar {...defaultProps} isPrd={false} tasksVisible={false} />);
    expect(screen.getByText(/5 tasks below/i)).toBeInTheDocument();
  });

  it('should call onScrollToTasks when tasks indicator clicked', () => {
    const onScrollToTasks = vi.fn();
    render(
      <StatusBar {...defaultProps} tasksVisible={false} onScrollToTasks={onScrollToTasks} />
    );

    const tasksIndicator = screen.getByText(/5 stories below/i);
    fireEvent.click(tasksIndicator);

    expect(onScrollToTasks).toHaveBeenCalledTimes(1);
  });

  it('should show suggestions count', () => {
    render(<StatusBar {...defaultProps} pendingSuggestionsCount={3} />);
    expect(screen.getByText(/3 changes suggested/i)).toBeInTheDocument();
  });

  it('should show singular "change" when only one suggestion', () => {
    render(<StatusBar {...defaultProps} pendingSuggestionsCount={1} />);
    expect(screen.getByText(/1 change suggested/i)).toBeInTheDocument();
  });

  it('should call onToggleSuggestions when suggestions button clicked', () => {
    const onToggleSuggestions = vi.fn();
    render(
      <StatusBar {...defaultProps} pendingSuggestionsCount={3} onToggleSuggestions={onToggleSuggestions} />
    );

    const suggestionsButton = screen.getByText(/3 changes suggested/i);
    fireEvent.click(suggestionsButton);

    expect(onToggleSuggestions).toHaveBeenCalledTimes(1);
  });

  it('should call onDismissAllSuggestions when X clicked', () => {
    const onDismissAllSuggestions = vi.fn();
    const { container } = render(
      <StatusBar
        {...defaultProps}
        pendingSuggestionsCount={3}
        onDismissAllSuggestions={onDismissAllSuggestions}
      />
    );

    // Find the X icon span by its cursor-pointer class
    const dismissSpan = container.querySelector('.cursor-pointer');
    if (dismissSpan) {
      fireEvent.click(dismissSpan);
    }

    expect(onDismissAllSuggestions).toHaveBeenCalledTimes(1);
  });
});
