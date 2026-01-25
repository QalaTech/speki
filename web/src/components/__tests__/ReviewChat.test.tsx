import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewChat } from '../review/ReviewChat';
import type { ChatMessage } from '../../../../src/types/index.js';

const mockMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  role: 'user',
  content: 'Test message content',
  timestamp: '2026-01-11T10:00:00.000Z',
  ...overrides,
});

describe('ReviewChat', () => {
  const defaultProps = {
    messages: [] as ChatMessage[],
    sessionId: 'session-123',
    onSendMessage: vi.fn().mockResolvedValue(undefined),
  };

  describe('ReviewChat_DisplaysHistory', () => {
    it('should display empty state when no messages', () => {
      render(<ReviewChat {...defaultProps} />);
      expect(screen.getByTestId('chat-empty')).toBeInTheDocument();
      expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
    });

    it('should display user messages with correct styling', () => {
      const messages = [mockMessage({ id: 'msg-1', role: 'user', content: 'Hello!' })];
      render(<ReviewChat {...defaultProps} messages={messages} />);

      const messageEl = screen.getByTestId('chat-message-user');
      expect(messageEl).toBeInTheDocument();
      expect(messageEl).toHaveClass('message-user');
      expect(messageEl).toHaveTextContent('Hello!');
    });

    it('should display assistant messages with correct styling', () => {
      const messages = [mockMessage({ id: 'msg-2', role: 'assistant', content: 'I can help you.' })];
      render(<ReviewChat {...defaultProps} messages={messages} />);

      const messageEl = screen.getByTestId('chat-message-assistant');
      expect(messageEl).toBeInTheDocument();
      expect(messageEl).toHaveClass('message-assistant');
      expect(messageEl).toHaveTextContent('I can help you.');
    });

    it('should display multiple messages in order', () => {
      const messages = [
        mockMessage({ id: 'msg-1', role: 'user', content: 'First message', timestamp: '2026-01-11T10:00:00Z' }),
        mockMessage({ id: 'msg-2', role: 'assistant', content: 'Second message', timestamp: '2026-01-11T10:01:00Z' }),
        mockMessage({ id: 'msg-3', role: 'user', content: 'Third message', timestamp: '2026-01-11T10:02:00Z' }),
      ];
      render(<ReviewChat {...defaultProps} messages={messages} />);

      const messageElements = screen.getAllByTestId(/chat-message-/);
      expect(messageElements).toHaveLength(3);
    });

    it('should display message timestamps', () => {
      const messages = [mockMessage({ timestamp: '2026-01-11T14:30:00.000Z' })];
      render(<ReviewChat {...defaultProps} messages={messages} />);

      // Timestamp format depends on locale, just check something is rendered
      const messageEl = screen.getByTestId('chat-message-user');
      expect(messageEl.querySelector('.message-time')).toBeInTheDocument();
    });
  });

  describe('ReviewChat_SendsMessages', () => {
    it('should render input field and send button', () => {
      render(<ReviewChat {...defaultProps} />);
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    it('should call onSendMessage when send button clicked', async () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      render(<ReviewChat {...defaultProps} onSendMessage={onSendMessage} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(screen.getByTestId('send-button'));

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined);
      });
    });

    it('should call onSendMessage when Enter pressed (without Shift)', async () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      render(<ReviewChat {...defaultProps} onSendMessage={onSendMessage} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Enter test' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith('Enter test', undefined);
      });
    });

    it('should not send when Shift+Enter pressed (multiline)', async () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      render(<ReviewChat {...defaultProps} onSendMessage={onSendMessage} />);

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Multiline test' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('should clear input after sending', async () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      render(<ReviewChat {...defaultProps} onSendMessage={onSendMessage} />);

      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Clear test' } });
      fireEvent.click(screen.getByTestId('send-button'));

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });

    it('should disable send button when input is empty', () => {
      render(<ReviewChat {...defaultProps} />);
      expect(screen.getByTestId('send-button')).toBeDisabled();
    });

    it('should disable input and button when isSending is true', () => {
      render(<ReviewChat {...defaultProps} isSending={true} />);

      expect(screen.getByTestId('chat-input')).toBeDisabled();
      expect(screen.getByTestId('send-button')).toBeDisabled();
      expect(screen.getByTestId('send-button')).toHaveTextContent('Sending...');
    });
  });

  describe('ReviewChat_DisplaysResponses', () => {
    it('should display assistant response messages', () => {
      const messages = [
        mockMessage({ id: 'msg-1', role: 'user', content: 'What does this mean?' }),
        mockMessage({ id: 'msg-2', role: 'assistant', content: 'This section describes...' }),
      ];
      render(<ReviewChat {...defaultProps} messages={messages} />);

      expect(screen.getByTestId('chat-message-assistant')).toHaveTextContent('This section describes...');
    });

    it('should show role label for each message', () => {
      const messages = [
        mockMessage({ id: 'msg-1', role: 'user', content: 'Question' }),
        mockMessage({ id: 'msg-2', role: 'assistant', content: 'Answer' }),
      ];
      render(<ReviewChat {...defaultProps} messages={messages} />);

      expect(screen.getByText('You')).toBeInTheDocument();
      expect(screen.getByText('Assistant')).toBeInTheDocument();
    });

    it('should show suggestion context when message has suggestionId', () => {
      const messages = [mockMessage({ id: 'msg-1', role: 'assistant', content: 'Response', suggestionId: 'sug-123' })];
      render(<ReviewChat {...defaultProps} messages={messages} />);

      expect(screen.getByTestId('message-context')).toBeInTheDocument();
      expect(screen.getByText(/Related to suggestion/)).toBeInTheDocument();
    });
  });

  describe('ReviewChat_IncludesSelectionContext', () => {
    it('should show selection context when selectedText is provided', () => {
      render(<ReviewChat {...defaultProps} selectedText="This is selected text" />);

      expect(screen.getByTestId('selection-context')).toBeInTheDocument();
      expect(screen.getByText(/This is selected text/)).toBeInTheDocument();
    });

    it('should truncate long selection text', () => {
      const longText = 'A'.repeat(100);
      render(<ReviewChat {...defaultProps} selectedText={longText} />);

      const selectionContext = screen.getByTestId('selection-context');
      expect(selectionContext).toHaveTextContent('A'.repeat(50) + '...');
    });

    it('should not show selection context when selectedText is not provided', () => {
      render(<ReviewChat {...defaultProps} />);
      expect(screen.queryByTestId('selection-context')).not.toBeInTheDocument();
    });

    it('should include selection context when sending message', async () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      render(<ReviewChat {...defaultProps} onSendMessage={onSendMessage} selectedText="Selected portion" />);

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'What about this?' } });
      fireEvent.click(screen.getByTestId('send-button'));

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith('What about this?', 'Selected portion');
      });
    });

    it('should update placeholder when selection is active', () => {
      render(<ReviewChat {...defaultProps} selectedText="Some selection" />);

      const input = screen.getByTestId('chat-input');
      expect(input).toHaveAttribute('placeholder', 'Ask about the selected text...');
    });
  });
});
