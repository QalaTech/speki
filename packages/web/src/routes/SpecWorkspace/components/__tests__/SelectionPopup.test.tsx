import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionPopup } from '../SelectionPopup';

describe('SelectionPopup', () => {
  const mockSelection = {
    text: 'selected text',
    position: { x: 100, y: 50 },
  };

  it('should render add to conversation button', () => {
    render(<SelectionPopup selection={mockSelection} onAddToConversation={vi.fn()} />);
    expect(screen.getByText(/add to conversation/i)).toBeInTheDocument();
  });

  it('should position correctly based on selection', () => {
    const { container } = render(
      <SelectionPopup selection={mockSelection} onAddToConversation={vi.fn()} />
    );

    const popup = container.firstChild as HTMLElement;
    expect(popup.style.left).toBe('100px');
    expect(popup.style.top).toBe('50px');
  });

  it('should call onAddToConversation with text when clicked', () => {
    const onAddToConversation = vi.fn();
    render(<SelectionPopup selection={mockSelection} onAddToConversation={onAddToConversation} />);

    const button = screen.getByText(/add to conversation/i);
    fireEvent.click(button);

    expect(onAddToConversation).toHaveBeenCalledWith('selected text');
  });
});
