import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TabButton } from '../TabButton';

describe('TabButton', () => {
  it('renders children correctly', () => {
    render(<TabButton active={false} onClick={() => {}}>Test Tab</TabButton>);
    expect(screen.getByText('Test Tab')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<TabButton active={false} onClick={handleClick}>Test Tab</TabButton>);
    fireEvent.click(screen.getByText('Test Tab'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies active styles when active is true', () => {
    render(<TabButton active={true} onClick={() => {}}>Active Tab</TabButton>);
    const button = screen.getByText('Active Tab');
    expect(button).toHaveClass('tab');
    expect(button).toHaveClass('tab-active');
  });

  it('applies inactive styles when active is false', () => {
    render(<TabButton active={false} onClick={() => {}}>Inactive Tab</TabButton>);
    const button = screen.getByText('Inactive Tab');
    expect(button).toHaveClass('tab');
    expect(button).not.toHaveClass('tab-active');
  });

  it('accepts custom className for overrides', () => {
    render(<TabButton active={false} onClick={() => {}} className="ml-4">Custom Tab</TabButton>);
    const button = screen.getByText('Custom Tab');
    expect(button).toHaveClass('ml-4');
  });

  it('applies sm size correctly with DaisyUI tab-sm class', () => {
    render(<TabButton active={false} onClick={() => {}} size="sm">Small Tab</TabButton>);
    const button = screen.getByText('Small Tab');
    expect(button).toHaveClass('tab-sm');
  });

  it('applies md size correctly (default) without tab-sm class', () => {
    render(<TabButton active={false} onClick={() => {}} size="md">Medium Tab</TabButton>);
    const button = screen.getByText('Medium Tab');
    expect(button).toHaveClass('tab');
    expect(button).not.toHaveClass('tab-sm');
  });

  it('defaults to md size when size is not specified', () => {
    render(<TabButton active={false} onClick={() => {}}>Default Tab</TabButton>);
    const button = screen.getByText('Default Tab');
    expect(button).toHaveClass('tab');
    expect(button).not.toHaveClass('tab-sm');
  });

  it('has role="tab" for accessibility', () => {
    render(<TabButton active={false} onClick={() => {}}>Accessible Tab</TabButton>);
    const button = screen.getByText('Accessible Tab');
    expect(button).toHaveAttribute('role', 'tab');
  });
});
