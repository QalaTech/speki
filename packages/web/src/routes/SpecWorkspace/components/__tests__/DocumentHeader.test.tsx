import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentHeader } from '../DocumentHeader';
import type { SpecType } from '../../../../components/specs/types';

describe('DocumentHeader', () => {
  const defaultProps = {
    title: 'My Test Spec',
    specType: 'prd' as SpecType,
    storiesCount: 5,
    isPrd: true,
    isSaving: false,
    lastSavedAt: null,
    hasUnsavedChanges: false,
    onScrollToStories: vi.fn(),
  };

  it('should render document title', () => {
    render(<DocumentHeader {...defaultProps} />);
    expect(screen.getByText('My Test Spec')).toBeInTheDocument();
  });

  it('should render spec type badge', () => {
    render(<DocumentHeader {...defaultProps} />);
    expect(screen.getByText('PRD')).toBeInTheDocument();
  });

  it('should render tech-spec badge correctly', () => {
    render(<DocumentHeader {...defaultProps} specType="tech-spec" />);
    expect(screen.getByText('TECH-SPEC')).toBeInTheDocument();
  });

  it('should render bug badge correctly', () => {
    render(<DocumentHeader {...defaultProps} specType="bug" />);
    expect(screen.getByText('BUG')).toBeInTheDocument();
  });

  it('should show stories count when stories exist', () => {
    render(<DocumentHeader {...defaultProps} storiesCount={5} />);
    expect(screen.getByText('5 stories')).toBeInTheDocument();
  });

  it('should show tasks count for tech specs', () => {
    render(<DocumentHeader {...defaultProps} specType="tech-spec" isPrd={false} storiesCount={3} />);
    expect(screen.getByText('3 tasks')).toBeInTheDocument();
  });

  it('should call onScrollToStories when stories badge is clicked', () => {
    const onScrollToStories = vi.fn();
    render(<DocumentHeader {...defaultProps} storiesCount={5} onScrollToStories={onScrollToStories} />);

    const storiesBadge = screen.getByText('5 stories');
    fireEvent.click(storiesBadge);

    expect(onScrollToStories).toHaveBeenCalledTimes(1);
  });

  it('should not show stories badge when count is 0', () => {
    render(<DocumentHeader {...defaultProps} storiesCount={0} />);
    expect(screen.queryByText(/stories/)).not.toBeInTheDocument();
  });

  it('should show saving indicator', () => {
    render(<DocumentHeader {...defaultProps} isSaving={true} />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('should show saved time when available', () => {
    const lastSavedAt = new Date('2024-01-01T12:00:00Z');
    render(<DocumentHeader {...defaultProps} lastSavedAt={lastSavedAt} />);
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it('should show unsaved indicator', () => {
    render(<DocumentHeader {...defaultProps} hasUnsavedChanges={true} />);
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });
});
