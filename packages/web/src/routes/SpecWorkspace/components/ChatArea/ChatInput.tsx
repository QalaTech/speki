import { useRef, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  SparklesIcon,
  ChevronDownIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { BotIcon, RotateCcw } from 'lucide-react';
import { Spinner } from '../../../../components/ui/Loading';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onNewChat: () => void;
  onStartReview: () => void;
  isSending: boolean;
  isStartingReview: boolean;
  onFocus?: () => void;
  isDiscussing?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onNewChat,
  onStartReview,
  isSending,
  isStartingReview,
  onFocus,
  isDiscussing,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl">
      {/* Textarea - top */}
      <div className="px-4 pt-3 pb-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          placeholder={isDiscussing ? "Ask about this suggestion..." : "Ask for follow-up changes"}
          rows={1}
          className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          style={{ minHeight: '24px', maxHeight: '120px' }}
        />
      </div>

      {/* Bottom bar - plus, model selector, icons, send */}
      <div className="flex items-center justify-between px-2 py-2">
        {/* Left side - plus button + model selector */}
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
            <PlusIcon className="w-5 h-5" />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <SparklesIcon className="w-4 h-4" />
            <span>Claude</span>
            <ChevronDownIcon className="w-3 h-3" />
          </button>
        </div>

        {/* Right side - icons + send */}
        <div className="flex items-center gap-1">
          {/* AI Review Button */}
          <button
            onClick={onStartReview}
            disabled={isStartingReview}
            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed group relative"
            title="Start AI Review"
          >
            {isStartingReview ? (
              <Spinner size="sm" className="text-white" />
            ) : (
              <BotIcon className="w-5 h-5" />
            )}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] bg-black/80 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {isStartingReview ? 'Reviewing...' : 'AI Review'}
            </span>
          </button>

          <button
            onClick={onNewChat}
            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors group relative"
            title="New Chat"
          >
            <RotateCcw className="w-5 h-5 text-muted-foreground" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] bg-black/80 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              New Chat
            </span>
          </button>

          <button
            onClick={onSend}
            disabled={!value.trim() || isSending}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-1 group relative"
            title="Send (⌘↵)"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] bg-black/80 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              ⌘↵
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
