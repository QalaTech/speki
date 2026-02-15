import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentHeader } from '../DocumentHeader';
import { SidebarProvider } from '@/components/ui/sidebar';

describe('DocumentHeader', () => {
  const defaultProps = {
    isSaving: false,
    lastSavedAt: null,
    hasUnsavedChanges: false,
  };

  const renderWithSidebar = (ui: React.ReactElement) => {
    return render(<SidebarProvider>{ui}</SidebarProvider>);
  };

  it('should show saving indicator', () => {
    renderWithSidebar(<DocumentHeader {...defaultProps} isSaving={true} />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('should show saved time when available', () => {
    const lastSavedAt = new Date();
    renderWithSidebar(<DocumentHeader {...defaultProps} lastSavedAt={lastSavedAt} />);
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it('should show unsaved indicator', () => {
    renderWithSidebar(<DocumentHeader {...defaultProps} hasUnsavedChanges={true} />);
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });

  it('should show default saved state when not saving and no changes', () => {
    renderWithSidebar(<DocumentHeader {...defaultProps} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});
