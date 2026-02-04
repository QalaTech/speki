import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '../ChatInput';

describe('ChatInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onNewChat: vi.fn(),
    onStartReview: vi.fn(),
    isSending: false,
    isStartingReview: false,
    onFocus: vi.fn(),
  };

  it('should render textarea with placeholder', () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByPlaceholderText(/ask for follow-up changes/i)).toBeInTheDocument();
  });

  it('should call onChange when typing', () => {
    const onChange = vi.fn();
    render(<ChatInput {...defaultProps} onChange={onChange} />);

    const textarea = screen.getByPlaceholderText(/ask for follow-up changes/i);
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    expect(onChange).toHaveBeenCalledWith('Hello');
  });

  it('should call onSend when Enter is pressed without shift', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} value="Hello" onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/ask for follow-up changes/i);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('should not call onSend when Enter+Shift is pressed', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} value="Hello" onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/ask for follow-up changes/i);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should call onSend when send button is clicked', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} value="Hello" onSend={onSend} />);

    const sendButton = screen.getByTitle(/send/i);
    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('should disable send button when value is empty', () => {
    render(<ChatInput {...defaultProps} value="" />);

    const sendButton = screen.getByTitle(/send/i);
    expect(sendButton).toBeDisabled();
  });

  it('should call onNewChat when new chat button is clicked', () => {
    const onNewChat = vi.fn();
    render(<ChatInput {...defaultProps} onNewChat={onNewChat} />);

    const newChatButton = screen.getByTitle(/new chat/i);
    fireEvent.click(newChatButton);

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('should call onStartReview when AI review button is clicked', () => {
    const onStartReview = vi.fn();
    render(<ChatInput {...defaultProps} onStartReview={onStartReview} />);

    const reviewButton = screen.getByTitle(/ai review/i);
    fireEvent.click(reviewButton);

    expect(onStartReview).toHaveBeenCalledTimes(1);
  });

  it('should show spinner when starting review', () => {
    render(<ChatInput {...defaultProps} isStartingReview={true} />);
    expect(screen.getByText(/reviewing/i)).toBeInTheDocument();
  });

  it('should call onFocus when textarea is focused', () => {
    const onFocus = vi.fn();
    render(<ChatInput {...defaultProps} onFocus={onFocus} />);

    const textarea = screen.getByPlaceholderText(/ask for follow-up changes/i);
    fireEvent.focus(textarea);

    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
