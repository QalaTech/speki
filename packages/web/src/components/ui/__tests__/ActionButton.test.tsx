import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionButton } from '../ActionButton';

describe('ActionButton', () => {
  it('renders children correctly', () => {
    render(<ActionButton variant="primary" onClick={() => {}}>Click Me</ActionButton>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<ActionButton variant="primary" onClick={handleClick}>Click Me</ActionButton>);
    fireEvent.click(screen.getByText('Click Me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(<ActionButton variant="primary" onClick={handleClick} disabled>Disabled</ActionButton>);
    fireEvent.click(screen.getByText('Disabled'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies disabled styles when disabled', () => {
    render(<ActionButton variant="primary" onClick={() => {}} disabled>Disabled</ActionButton>);
    const button = screen.getByText('Disabled');
    expect(button).toBeDisabled();
  });

  describe('variants', () => {
    it('renders primary variant with btn-glass-primary class', () => {
      render(<ActionButton variant="primary" onClick={() => {}}>Primary</ActionButton>);
      const button = screen.getByText('Primary');
      expect(button).toHaveClass('btn-glass-primary');
    });

    it('renders danger variant with btn-glass-error class', () => {
      render(<ActionButton variant="danger" onClick={() => {}}>Danger</ActionButton>);
      const button = screen.getByText('Danger');
      expect(button).toHaveClass('btn-glass-error');
    });

    it('renders secondary variant with btn-glass-secondary class', () => {
      render(<ActionButton variant="secondary" onClick={() => {}}>Secondary</ActionButton>);
      const button = screen.getByText('Secondary');
      expect(button).toHaveClass('btn-glass-secondary');
    });

    it('renders success variant with btn-glass-success class', () => {
      render(<ActionButton variant="success" onClick={() => {}}>Success</ActionButton>);
      const button = screen.getByText('Success');
      expect(button).toHaveClass('btn-glass-success');
    });

    it('renders approve variant with btn-glass-success class', () => {
      render(<ActionButton variant="approve" onClick={() => {}}>Approve</ActionButton>);
      const button = screen.getByText('Approve');
      expect(button).toHaveClass('btn-glass-success');
    });

    it('renders reject variant with btn-glass-error class', () => {
      render(<ActionButton variant="reject" onClick={() => {}}>Reject</ActionButton>);
      const button = screen.getByText('Reject');
      expect(button).toHaveClass('btn-glass-error');
    });
  });

  describe('sizes', () => {
    it('applies sm size correctly', () => {
      render(<ActionButton variant="primary" onClick={() => {}} size="sm">Small</ActionButton>);
      const button = screen.getByText('Small');
      // ShadCN uses Tailwind classes for sizing
      expect(button).toHaveClass('h-8');
      expect(button).toHaveClass('px-3');
    });

    it('applies md size correctly (default)', () => {
      render(<ActionButton variant="primary" onClick={() => {}} size="md">Medium</ActionButton>);
      const button = screen.getByText('Medium');
      // ShadCN uses Tailwind classes for sizing
      expect(button).toHaveClass('h-9');
      expect(button).toHaveClass('px-4');
    });
  });

  it('accepts custom className for overrides', () => {
    render(<ActionButton variant="primary" onClick={() => {}} className="ml-4">Custom</ActionButton>);
    const button = screen.getByText('Custom');
    expect(button).toHaveClass('ml-4');
  });

  it('passes through type attribute', () => {
    render(<ActionButton variant="primary" onClick={() => {}} type="submit">Submit</ActionButton>);
    const button = screen.getByText('Submit');
    expect(button).toHaveAttribute('type', 'submit');
  });
});
