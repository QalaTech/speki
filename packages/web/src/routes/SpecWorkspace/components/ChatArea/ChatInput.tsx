import { useRef, useEffect, useCallback } from 'react';
import {
  PaperAirplaneIcon,
  SparklesIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import * as SelectPrimitive from '@radix-ui/react-select';
import { BotIcon } from 'lucide-react';
import { Spinner } from '../../../../components/ui/Loading';
import { Button } from '../../../../components/ui/Button';
import { useSettings, useUpdateSettings, useCliDetection } from '@/features/settings';
import {
  SelectContent,
  SelectItem
} from '@/components/ui/Select';
import type { CliType } from '@/types';
import { isIOSSafari } from '../../../../hooks/use-mobile';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStartReview: () => void;
  onGenerateStories?: () => void;
  isSending: boolean;
  isStartingReview: boolean;
  isGeneratingStories?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  isDiscussing?: boolean;
  focusTrigger?: number;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStartReview,
  onGenerateStories,
  isSending,
  isStartingReview,
  isGeneratingStories,
  onFocus,
  onBlur,
  isDiscussing,
  focusTrigger,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusScrollLockRef = useRef<{
    rafId: number | null;
    timeoutIds: number[];
    restore: () => void;
    viewport: VisualViewport | null;
  } | null>(null);
  const isSendDisabled = !value.trim() || isSending;
  
  const { data: settings } = useSettings();
  const { data: cliDetection } = useCliDetection();
  const updateSettingsMutation = useUpdateSettings();

  const currentAgent = settings?.specChat?.agent || 'claude';

  const availableClis = cliDetection
    ? (Object.keys(cliDetection) as CliType[]).filter((key) => cliDetection[key]?.available)
    : [];

  const releaseFocusScrollLock = useCallback(() => {
    const lockState = focusScrollLockRef.current;
    if (!lockState) return;

    if (lockState.rafId !== null) {
      window.cancelAnimationFrame(lockState.rafId);
    }
    lockState.timeoutIds.forEach((id) => window.clearTimeout(id));
    lockState.viewport?.removeEventListener('resize', lockState.restore);
    lockState.viewport?.removeEventListener('scroll', lockState.restore);
    window.removeEventListener('scroll', lockState.restore);

    focusScrollLockRef.current = null;
  }, []);

  const lockIOSFocusScroll = useCallback(() => {
    if (!isIOSSafari()) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    releaseFocusScrollLock();

    const initialScrollX = window.scrollX;
    const initialScrollY = window.scrollY;
    const restore = () => {
      if (document.activeElement !== textarea) return;
      window.scrollTo(initialScrollX, initialScrollY);
    };

    const timeoutIds = [0, 75, 150, 300, 500, 700].map((delay) =>
      window.setTimeout(restore, delay)
    );

    const stopAt = Date.now() + 900;
    const tick = () => {
      restore();
      if (document.activeElement !== textarea || Date.now() >= stopAt) return;
      const rafId = window.requestAnimationFrame(tick);
      if (focusScrollLockRef.current) {
        focusScrollLockRef.current.rafId = rafId;
      }
    };
    const rafId = window.requestAnimationFrame(tick);

    const viewport = window.visualViewport ?? null;
    viewport?.addEventListener('resize', restore);
    viewport?.addEventListener('scroll', restore);
    window.addEventListener('scroll', restore, { passive: true });

    focusScrollLockRef.current = {
      rafId,
      timeoutIds,
      restore,
      viewport,
    };
  }, [releaseFocusScrollLock]);

  const setChatInputFocusClass = useCallback((focused: boolean) => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('chat-input-focused', focused);
  }, []);

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
      const textarea = textareaRef.current;
      if (!textarea) return;

      try {
        textarea.focus({ preventScroll: true });
      } catch {
        textarea.focus();
      }
    }
  }, [focusTrigger]);

  useEffect(
    () => () => {
      setChatInputFocusClass(false);
      releaseFocusScrollLock();
    },
    [releaseFocusScrollLock, setChatInputFocusClass]
  );

  const handleFocus = () => {
    setChatInputFocusClass(true);
    lockIOSFocusScroll();
    onFocus?.();
  };

  const handleBlur = () => {
    setChatInputFocusClass(false);
    releaseFocusScrollLock();
    onBlur?.();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLTextAreaElement>) => {
    if (!isIOSSafari()) return;

    const textarea = textareaRef.current;
    if (!textarea) return;
    if (document.activeElement === textarea) return;

    // Prevent Safari's native focus-scroll and focus manually without scrolling.
    e.preventDefault();
    lockIOSFocusScroll();
    try {
      textarea.focus({ preventScroll: true });
    } catch {
      textarea.focus();
    }
  };

  const handleClick = () => {
    if (document.activeElement === textareaRef.current) return;
    handleFocus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    e.preventDefault();
    if (isSendDisabled) return;
    onSend();
  };

  return (
    <div
      className="rounded-2xl bg-card border border-border shadow-[0_-8px_40px_rgba(0,0,0,0.45),0_-2px_12px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.04]"
      data-conversation-keep-open
    >
      {/* Textarea - top */}
      <div className="px-4 pt-3 pb-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onTouchStart={handleTouchStart}
          onClick={handleClick}
          data-chat-input
          placeholder={isDiscussing ? "Ask about this context..." : "Ask for follow-up changes"}
          rows={1}
          className="w-full resize-none bg-transparent text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-h-6 max-h-[120px]"
        />
      </div>

      {/* Bottom bar - plus, model selector, icons, send */}
      <div className="flex items-center justify-between px-2 py-2">
        {/* Left side - AI Review + New Chat buttons */}
        <div className="flex items-center gap-2">
          {/* Hide temporarily until we have utility for it. */}
          {/* <button className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
            <PlusIcon className="w-5 h-5" />
          </button> */}

          {/* AI Review Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onStartReview}
            isLoading={isStartingReview}
            className="text-muted-foreground hover:text-foreground h-auto py-1.5 px-2"
          >
            <BotIcon className="w-4 h-4" />
            AI Review
          </Button>

          {/* Generate Stories Button */}
          {onGenerateStories && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onGenerateStories}
              isLoading={isGeneratingStories}
              loadingText="Generating"
              className="text-muted-foreground hover:text-foreground h-auto py-1.5 px-2"
            >
              <SparklesIcon className="w-4 h-4" />
              Generate
            </Button>
          )}
        </div>

        {/* Right side - model selector + send */}
        <div className="flex items-center gap-1">
          <SelectPrimitive.Root value={currentAgent} onValueChange={handleAgentChange}>
            <SelectPrimitive.Trigger
              data-conversation-keep-open
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-colors border-none focus:outline-none"
            >
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
