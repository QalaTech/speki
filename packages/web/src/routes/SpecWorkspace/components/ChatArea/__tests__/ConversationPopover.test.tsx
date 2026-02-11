import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationPopover } from '../ConversationPopover';
import type { ChatMessage } from '../../../../../components/specs/types';

describe('ConversationPopover', () => {
  const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 400,
    });
  });

  afterEach(() => {
    if (scrollHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      return;
    }

    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
  });

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
    selectedContext: null,
    onClose: vi.fn(),
    onClearDiscussingContext: vi.fn(),
    onClearSelectedContext: vi.fn(),
  };

  it('should render conversation header', () => {
    render(<ConversationPopover {...defaultProps} />);
    expect(screen.getByText('Conversation')).toBeInTheDocument();
  });

  it('should auto-scroll to bottom without active context', async () => {
    render(<ConversationPopover {...defaultProps} />);

    const popover = screen.getByTestId('conversation-popover');
    await waitFor(() => {
      expect(popover.scrollTop).toBe(400);
    });
  });

  it('should keep selection context visible by scrolling to bottom', async () => {
    render(
      <ConversationPopover
        {...defaultProps}
        selectedContext="Selected paragraph from the editor"
      />
    );

    const popover = screen.getByTestId('conversation-popover');
    await waitFor(() => {
      expect(popover.scrollTop).toBe(400);
    });
  });

  it('should render selected context below existing messages', () => {
    render(
      <ConversationPopover
        {...defaultProps}
        selectedContext="Selected paragraph from the editor"
      />
    );

    const latestMessage = screen.getByText('Hello! How can I help?');
    const contextLabel = screen.getByText('Replying to selected text:');
    expect(
      latestMessage.compareDocumentPosition(contextLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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
      suggestionId: 'test-id',
      issue: 'This is the suggestion being discussed',
      suggestedFix: 'Suggested fix text',
    };

    render(<ConversationPopover {...defaultProps} discussingContext={discussingContext} />);
    
    expect(screen.getByText('Replying to review item:')).toBeInTheDocument();
    expect(screen.getByText(/This is the suggestion being discussed/)).toBeInTheDocument();
    expect(screen.getByText('Suggested fix text')).toBeInTheDocument();
  });

  it('should show selected text context banner when provided', () => {
    render(
      <ConversationPopover
        {...defaultProps}
        selectedContext="Selected paragraph from the editor"
      />
    );

    expect(screen.getByText('Replying to selected text:')).toBeInTheDocument();
    expect(screen.getByText('"Selected paragraph from the editor"')).toBeInTheDocument();
  });

  it('should render structured user message when content includes selection context', () => {
    const selectionMessage: ChatMessage = {
      id: 'u-2',
      role: 'user',
      content: '[Selection: "This is another"] Regarding this text from the spec: > This is another Is this another?',
      timestamp: '2024-01-01T19:20:00Z',
    };

    render(
      <ConversationPopover
        {...defaultProps}
        messages={[selectionMessage]}
      />
    );

    expect(screen.queryByText('[Selection: "This is another"]')).not.toBeInTheDocument();
    expect(screen.getByText('This is another')).toBeInTheDocument();
    expect(screen.getByText('Is this another?')).toBeInTheDocument();
  });

  it('should style contextual user messages like normal user bubbles without header meta', () => {
    const selectionMessage: ChatMessage = {
      id: 'u-meta',
      role: 'user',
      content: '[Selection: "Quoted line"]\n\nWhat do you think?',
      timestamp: '2024-01-01T19:20:00Z',
    };

    render(
      <ConversationPopover
        {...defaultProps}
        messages={[selectionMessage]}
      />
    );

    const question = screen.getByText('What do you think?');
    const bubble = question.closest('div.bg-tertiary');
    expect(bubble).toBeInTheDocument();
    expect(screen.queryByText(/^you$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText((content) => /^\d{1,2}:\d{2}(\s?[AP]M)?$/.test(content))
    ).not.toBeInTheDocument();
  });

  it('should render structured selection message when selected text includes quotes', () => {
    const selectionMessage: ChatMessage = {
      id: 'u-quoted',
      role: 'user',
      content: `[Selection: "The function "sayHello" output"]\n\nCan we clarify this behavior?`,
      timestamp: '2024-01-01T19:25:00Z',
    };

    render(
      <ConversationPopover
        {...defaultProps}
        messages={[selectionMessage]}
      />
    );

    expect(screen.queryByText(/\[Selection:/i)).not.toBeInTheDocument();
    expect(screen.getByText('The function "sayHello" output')).toBeInTheDocument();
    expect(screen.getByText('Can we clarify this behavior?')).toBeInTheDocument();
  });

  it('should render structured user message when content includes suggestion context', () => {
    const suggestionMessage: ChatMessage = {
      id: 'u-3',
      role: 'user',
      content: `[Discussing Suggestion]
Issue: This is a placeholder requirement
Your previous suggestion: Replace with a concrete requirement

User's question: Can you make this specific?`,
      timestamp: '2024-01-01T19:21:00Z',
      suggestionId: 'test-id',
    };

    render(
      <ConversationPopover
        {...defaultProps}
        messages={[suggestionMessage]}
      />
    );

    expect(screen.queryByText(/\[Discussing Suggestion\]/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/User's question:/i)).not.toBeInTheDocument();
    expect(screen.getByText('This is a placeholder requirement')).toBeInTheDocument();
    expect(screen.getByText('Replace with a concrete requirement')).toBeInTheDocument();
    expect(screen.getByText('Can you make this specific?')).toBeInTheDocument();
  });

  it('should call onClearDiscussingContext when X clicked on banner', () => {
    const onClearDiscussingContext = vi.fn();
    const discussingContext = {
      suggestionId: 'test-id',
      issue: 'Test issue',
      suggestedFix: '',
    };

    render(
      <ConversationPopover
        {...defaultProps}
        discussingContext={discussingContext}
        onClearDiscussingContext={onClearDiscussingContext}
      />
    );

    // Get the X button within the discussing context banner (the clear context button)
    const clearButtons = screen.getAllByRole('button');
    // The second button should be the clear context button (first is close button)
    const clearButton = clearButtons[1];
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
