import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from '../StatusBar';

describe('StatusBar', () => {
  const defaultProps = {
    storiesCount: 5,
    isPrd: true,
    tasksVisible: true,
    pendingSuggestionsCount: 0,
    isReviewPanelOpen: false,
    onScrollToTasks: vi.fn(),
    onOpenReviewPanel: vi.fn(),
    queueCount: 0,
    onOpenQueue: vi.fn(),
  };

  it('should show queue indicator even when no stories or suggestions', () => {
    render(<StatusBar {...defaultProps} storiesCount={0} />);
    expect(screen.getByText(/View execution queue/i)).toBeInTheDocument();
  });

  it('should show tasks below indicator when tasks not visible', () => {
    render(<StatusBar {...defaultProps} tasksVisible={false} />);
    // In jsdom tests without viewport, "below" is hidden (max-lg:hidden)
    expect(screen.getByText(/5 stories/i)).toBeInTheDocument();
  });

  it('should show tasks count for non-PRD specs', () => {
    render(<StatusBar {...defaultProps} isPrd={false} tasksVisible={false} />);
    // In jsdom tests without viewport, "below" is hidden (max-lg:hidden)
    expect(screen.getByText(/5 tasks/i)).toBeInTheDocument();
  });

  it('should call onScrollToTasks when tasks indicator clicked', () => {
    const onScrollToTasks = vi.fn();
    render(
      <StatusBar {...defaultProps} tasksVisible={false} onScrollToTasks={onScrollToTasks} />
    );

    // In jsdom tests without viewport, "below" is hidden (max-lg:hidden)
    const tasksIndicator = screen.getByText(/5 stories/i);
    fireEvent.click(tasksIndicator);

    expect(onScrollToTasks).toHaveBeenCalledTimes(1);
  });

  it('should show suggestions count', () => {
    render(<StatusBar {...defaultProps} pendingSuggestionsCount={3} />);
    expect(screen.getByText(/3 comments/i)).toBeInTheDocument();
  });

  it('should call onOpenReviewPanel when suggestions button clicked', () => {
    const onOpenReviewPanel = vi.fn();
    render(
      <StatusBar {...defaultProps} pendingSuggestionsCount={3} onOpenReviewPanel={onOpenReviewPanel} />
    );

    const suggestionsButton = screen.getByText(/3 comments/i);
    fireEvent.click(suggestionsButton);

    expect(onOpenReviewPanel).toHaveBeenCalledTimes(1);
  });

  it('should show queue count', () => {
    render(<StatusBar {...defaultProps} queueCount={3} onOpenQueue={vi.fn()} />);
    expect(screen.getByText(/View execution queue \(3 total tasks\)/i)).toBeInTheDocument();
  });

  it('should call onOpenQueue when queue indicator clicked', () => {
    const onOpenQueue = vi.fn();
    render(<StatusBar {...defaultProps} queueCount={3} onOpenQueue={onOpenQueue} />);

    const queueIndicator = screen.getByText(/View execution queue/i);
    fireEvent.click(queueIndicator);

    expect(onOpenQueue).toHaveBeenCalledTimes(1);
  });
});
