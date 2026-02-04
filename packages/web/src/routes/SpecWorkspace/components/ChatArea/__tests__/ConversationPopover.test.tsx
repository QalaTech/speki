import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationPopover } from '../ConversationPopover';
import type { ChatMessage } from '../../../../../components/specs/types';

describe('ConversationPopover', () => {
  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      role: 'user',
      content: 'Hello AI',
      timestamp: '2024-01-01T12:00:00Z',
    },
    {
      id: '2',
      role: 'assistant',
      content: 'Hello! How can I help?',
      timestamp: '2024-01-01T12:00:01Z',
    },
  ];

  const defaultProps = {
    messages: mockMessages,
    isSending: false,
    quirkyMessage: null,
    discussingContext: null,
    onClose: vi.fn(),
    onClearDiscussingContext: vi.fn(),
  };

  it('should render conversation header', () => {
    render(<ConversationPopover {...defaultProps} />);
    expect(screen.getByText('Conversation')).toBeInTheDocument();
  });

  it('should render all messages', () => {
    render(<ConversationPopover {...defaultProps} />);
    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ConversationPopover {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByRole('button');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should show discussing context banner when provided', () => {
    const discussingContext = {
      issue: 'This is the suggestion being discussed',
    };

    render(<ConversationPopover {...defaultProps} discussingContext={discussingContext} />);
    
    expect(screen.getByText('Discussing Suggestion')).toBeInTheDocument();
    expect(screen.getByText('This is the suggestion being discussed')).toBeInTheDocument();
  });

  it('should call onClearDiscussingContext when X clicked on banner', () => {
    const onClearDiscussingContext = vi.fn();
    const discussingContext = {
      issue: 'Test issue',
    };

    render(
      <ConversationPopover
        {...defaultProps}
        discussingContext={discussingContext}
        onClearDiscussingContext={onClearDiscussingContext}
      />
    );

    // Get the X button within the discussing context banner
    const banner = screen.getByText('Discussing Suggestion').closest('div')?.parentElement;
    const clearButton = banner?.querySelector('button');
    if (clearButton) {
      fireEvent.click(clearButton);
    }

    expect(onClearDiscussingContext).toHaveBeenCalledTimes(1);
  });

  it('should show thinking indicator when isSending', () => {
    render(<ConversationPopover {...defaultProps} isSending={true} />);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it('should show quirky message when provided', () => {
    const quirkyMessage = { text: 'Pondering deeply...', icon: '💭' };
    render(<ConversationPopover {...defaultProps} isSending={true} quirkyMessage={quirkyMessage} />);
    
    expect(screen.getByText(/pondering deeply/i)).toBeInTheDocument();
  });
});
