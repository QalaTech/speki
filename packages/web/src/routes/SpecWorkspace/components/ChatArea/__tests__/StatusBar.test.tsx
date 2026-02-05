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

  it('should return null when no tasks indicator or suggestions', () => {
    const { container } = render(<StatusBar {...defaultProps} storiesCount={0} />);
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

  it('should call onOpenReviewPanel when suggestions button clicked', () => {
    const onOpenReviewPanel = vi.fn();
    render(
      <StatusBar {...defaultProps} pendingSuggestionsCount={3} onOpenReviewPanel={onOpenReviewPanel} />
    );

    const suggestionsButton = screen.getByText(/3 changes/i);
    fireEvent.click(suggestionsButton);

    expect(onOpenReviewPanel).toHaveBeenCalledTimes(1);
  });

  it('should show queue count', () => {
    render(<StatusBar {...defaultProps} queueCount={3} onOpenQueue={vi.fn()} />);
    expect(screen.getByText(/View execution log \(3 total tasks\)/i)).toBeInTheDocument();
  });

  it('should call onOpenQueue when queue indicator clicked', () => {
    const onOpenQueue = vi.fn();
    render(<StatusBar {...defaultProps} queueCount={3} onOpenQueue={onOpenQueue} />);

    const queueIndicator = screen.getByText(/View execution log/i);
    fireEvent.click(queueIndicator);

    expect(onOpenQueue).toHaveBeenCalledTimes(1);
  });
});
