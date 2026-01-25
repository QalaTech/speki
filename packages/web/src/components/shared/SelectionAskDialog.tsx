/**
 * SelectionAskDialog - Floating dialog that appears when text is selected.
 * Captures user's question about the selected text and triggers chat.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface SelectionAskDialogProps {
  selectedText: string;
  position: { top: number; left: number };
  onSubmit: (selectedText: string, question: string) => void;
  onClose: () => void;
}

export function SelectionAskDialog({
  selectedText,
  position,
  onSubmit,
  onClose,
}: SelectionAskDialogProps) {
  const [question, setQuestion] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Track if we just expanded to prevent immediate close
  const justExpandedRef = useRef(false);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isExpanded]);

  // Close on Escape (only when expanded)
  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, onClose]);

  // Close when clicking outside (only when expanded)
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Skip if we just expanded
      if (justExpandedRef.current) {
        justExpandedRef.current = false;
        return;
      }

      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Add listener after a delay to avoid catching the expand click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 200);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded, onClose]);

  const handleExpand = useCallback(() => {
    justExpandedRef.current = true;
    setIsExpanded(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (question.trim()) {
      onSubmit(selectedText, question.trim());
    }
  }, [selectedText, question, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Truncate selected text for display
  const displayText = selectedText.length > 100
    ? selectedText.substring(0, 100) + '...'
    : selectedText;

  if (!isExpanded) {
    // Initial state - just show the "Ask about this" button
    return (
      <div
        data-selection-ask-dialog
        className="absolute z-50 transform -translate-x-1/2"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                     bg-primary text-primary-content shadow-lg shadow-primary/30
                     hover:bg-primary-focus hover:shadow-xl hover:shadow-primary/40
                     transition-all duration-200
                     animate-in fade-in slide-in-from-bottom-2 duration-150"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleExpand}
          title="Ask about selected text"
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
          Ask about this
        </button>
      </div>
    );
  }

  // Expanded state - show dialog with input
  return (
    <div
      ref={dialogRef}
      data-selection-ask-dialog
      className="absolute z-50 w-80 rounded-xl bg-base-100 border border-base-content/10
                 shadow-2xl shadow-black/20 transform -translate-x-1/2
                 animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: position.top,
        left: position.left,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 bg-base-200/50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/20">
            <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-base-content">Ask about selection</span>
        </div>
        <button
          className="btn btn-ghost btn-xs btn-circle hover:bg-base-300"
          onClick={onClose}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Selected text preview */}
      <div className="px-4 py-3 border-b border-base-content/5 bg-base-200/30">
        <p className="text-xs text-base-content/60 mb-1">Selected text:</p>
        <p className="text-sm text-base-content/80 italic line-clamp-3">
          "{displayText}"
        </p>
      </div>

      {/* Input area */}
      <div className="p-4">
        <textarea
          ref={inputRef}
          className="textarea textarea-bordered w-full text-sm min-h-[80px] resize-none
                     focus:textarea-primary focus:border-primary/50"
          placeholder="What would you like to know about this?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-base-content/40">
            Press Enter to send
          </span>
          <button
            className="btn btn-primary btn-sm gap-2"
            onClick={handleSubmit}
            disabled={!question.trim()}
          >
            <ChatBubbleLeftRightIcon className="h-4 w-4" />
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
