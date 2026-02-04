import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('should render empty state message', () => {
    render(<EmptyState onCreateNew={vi.fn()} />);

    expect(screen.getByText('Select a spec')).toBeInTheDocument();
    expect(screen.getByText(/Choose a spec from the sidebar/i)).toBeInTheDocument();
  });

  it('should render new spec button', () => {
    render(<EmptyState onCreateNew={vi.fn()} />);

    expect(screen.getByRole('button', { name: /new spec/i })).toBeInTheDocument();
  });

  it('should call onCreateNew when button is clicked', () => {
    const onCreateNew = vi.fn();
    render(<EmptyState onCreateNew={onCreateNew} />);

    const button = screen.getByRole('button', { name: /new spec/i });
    fireEvent.click(button);

    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });
});
