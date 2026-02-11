import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentHeader } from '../DocumentHeader';

describe('DocumentHeader', () => {
  const defaultProps = {
    isSaving: false,
    lastSavedAt: null,
    hasUnsavedChanges: false,
  };

  it('should show saving indicator', () => {
    render(<DocumentHeader {...defaultProps} isSaving={true} />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('should show saved time when available', () => {
    const lastSavedAt = new Date();
    render(<DocumentHeader {...defaultProps} lastSavedAt={lastSavedAt} />);
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it('should show unsaved indicator', () => {
    render(<DocumentHeader {...defaultProps} hasUnsavedChanges={true} />);
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });

  it('should show default saved state when not saving and no changes', () => {
    render(<DocumentHeader {...defaultProps} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});
