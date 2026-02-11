import { useRef, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  SparklesIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import * as SelectPrimitive from '@radix-ui/react-select';
import { BotIcon, RotateCcw } from 'lucide-react';
import { Spinner } from '../../../../components/ui/Loading';
import { useSettings, useUpdateSettings, useCliDetection } from '@/features/settings';
import { 
  SelectContent, 
  SelectItem 
} from '@/components/ui/Select';
import type { CliType } from '@/types';

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
  focusTrigger?: number;
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
  focusTrigger,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSendDisabled = !value.trim() || isSending;
  
  const { data: settings } = useSettings();
  const { data: cliDetection } = useCliDetection();
  const updateSettingsMutation = useUpdateSettings();

  const currentAgent = settings?.specChat?.agent || 'claude';

  const availableClis = cliDetection
    ? (Object.keys(cliDetection) as CliType[]).filter((key) => cliDetection[key]?.available)
    : [];

  const handleAgentChange = (newAgent: string) => {
    updateSettingsMutation.mutate({
      specChat: {
        ...settings?.specChat,
        agent: newAgent as CliType,
      }
    });
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  // Handle outside focus trigger
  useEffect(() => {
    if (focusTrigger && focusTrigger > 0) {
      textareaRef.current?.focus();
    }
  }, [focusTrigger]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    e.preventDefault();
    if (isSendDisabled) return;
    onSend();
  };

  return (
    <div
      className="rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl"
      data-conversation-keep-open
    >
      {/* Textarea - top */}
      <div className="px-4 pt-3 pb-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onClick={onFocus}
          placeholder={isDiscussing ? "Ask about this context..." : "Ask for follow-up changes"}
          rows={1}
          className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          style={{ minHeight: '24px', maxHeight: '120px' }}
        />
      </div>

      {/* Bottom bar - plus, model selector, icons, send */}
      <div className="flex items-center justify-between px-2 py-2">
        {/* Left side - plus button + model selector */}
        <div className="flex items-center gap-1">
          {/* Hide temporarily until we have utility for it. */}
          {/* <button className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
            <PlusIcon className="w-5 h-5" />
          </button> */}
          
          <SelectPrimitive.Root value={currentAgent} onValueChange={handleAgentChange}>
            <SelectPrimitive.Trigger
              data-conversation-keep-open
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-colors border-none focus:outline-none"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{currentAgent.charAt(0).toUpperCase() + currentAgent.slice(1)}</span>
              <ChevronDownIcon className="w-3 h-3" />
            </SelectPrimitive.Trigger>
            <SelectContent
              data-conversation-keep-open
              className="bg-[#1a1a1a] border-white/10"
            >
              {availableClis.map((cli) => (
                <SelectItem 
                  key={cli} 
                  value={cli}
                  data-conversation-keep-open
                  className="text-xs text-muted-foreground focus:text-foreground focus:bg-white/5"
                >
                  {cli.charAt(0).toUpperCase() + cli.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectPrimitive.Root>
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
            disabled={isSendDisabled}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-1 group relative"
            title={isSending ? 'Sending...' : 'Send (⌘↵)'}
          >
            {isSending ? (
              <Spinner size="sm" className="text-white" />
            ) : (
              <PaperAirplaneIcon className="w-4 h-4" />
            )}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] bg-black/80 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {isSending ? 'Sending...' : '⌘↵'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
