import { useRef, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

import { ChatMarkdown } from '../../../../components/chat/ChatMarkdown';
import type { ChatMessage } from '../../../../components/specs/types';
import type { DiscussingContext } from '../../../../components/review/ReviewChat';

import type { QuirkyMessage } from '../../constants';

interface ParsedSelectionMessage {
  hasSelectionContext: boolean;
  selectedSnippet: string | null;
  question: string;
}

interface ParsedSuggestionMessage {
  hasSuggestionContext: boolean;
  issue: string | null;
  suggestedFix: string | null;
  question: string;
}

type ParsedUserMessage =
  | { contextType: 'none'; question: string }
  | { contextType: 'selection'; selectedSnippet: string | null; question: string }
  | { contextType: 'suggestion'; issue: string | null; suggestedFix: string | null; question: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSelectionMessage(content: string): ParsedSelectionMessage {
  const trimmed = content.trim();
  const selectionPrefixMatch = trimmed.match(/^\[Selection:\s*"/i);
  const markerMatch = trimmed.match(/Regarding this text from the spec:\s*/i);
  let selectionToken: string | null = null;
  let selectionLabel: string | null = null;
  let remainder = trimmed;

  if (selectionPrefixMatch) {
    const selectionStartIndex = selectionPrefixMatch[0].length;
    const selectionEndIndex = trimmed.indexOf('"]', selectionStartIndex);
    if (selectionEndIndex >= 0) {
      selectionLabel = trimmed.slice(selectionStartIndex, selectionEndIndex).trim();
      selectionToken = trimmed.slice(0, selectionEndIndex + 2);
      remainder = trimmed.slice(selectionEndIndex + 2).trim();
    }
  }

  if (!selectionToken && !markerMatch) {
    return {
      hasSelectionContext: false,
      selectedSnippet: null,
      question: trimmed,
    };
  }

  if (markerMatch) {
    const markerIndex = remainder.search(/Regarding this text from the spec:\s*/i);
    if (markerIndex >= 0) {
      remainder = remainder.slice(markerIndex + markerMatch[0].length).trim();
    }
  }

  let selectedSnippet = selectionLabel;
  let question = remainder;

  // Parse block-quote style context (legacy format):
  // Regarding this text from the spec:
  // > selected text
  //
  // user question
  if (!selectedSnippet && question.startsWith('>')) {
    const lines = question.split('\n');
    const quoteLines: string[] = [];
    let idx = 0;

    while (idx < lines.length && lines[idx]?.trim().startsWith('>')) {
      quoteLines.push(lines[idx].replace(/^>\s?/, '').trim());
      idx += 1;
    }

    selectedSnippet = quoteLines.join('\n').trim() || null;
    question = lines.slice(idx).join('\n').trim();
  } else if (question.startsWith('>')) {
    question = question.replace(/^>\s*/, '').trim();
  }

  if (selectedSnippet) {
    const snippetPattern = new RegExp(`^${escapeRegExp(selectedSnippet)}\\s*`, 'i');
    question = question.replace(snippetPattern, '').trim();
  }

  return {
    hasSelectionContext: true,
    selectedSnippet,
    question: question || trimmed,
  };
}

function parseSuggestionMessage(content: string): ParsedSuggestionMessage {
  const trimmed = content.trim();

  if (!/\[Discussing Suggestion\]/i.test(trimmed)) {
    return {
      hasSuggestionContext: false,
      issue: null,
      suggestedFix: null,
      question: trimmed,
    };
  }

  const withoutHeader = trimmed.replace(/\[Discussing Suggestion\]\s*/i, '').trim();
  const questionMatch = withoutHeader.match(/User's question:\s*([\s\S]*)$/i);
  const question = questionMatch?.[1]?.trim() ?? withoutHeader;
  const beforeQuestion = questionMatch
    ? withoutHeader.slice(0, questionMatch.index).trim()
    : withoutHeader;

  const issueMatch = beforeQuestion.match(/Issue:\s*([\s\S]*?)(?=Your previous suggestion:|$)/i);
  const suggestedFixMatch = beforeQuestion.match(/Your previous suggestion:\s*([\s\S]*)$/i);

  return {
    hasSuggestionContext: true,
    issue: issueMatch?.[1]?.trim() || null,
    suggestedFix: suggestedFixMatch?.[1]?.trim() || null,
    question: question || trimmed,
  };
}

function parseUserMessage(content: string): ParsedUserMessage {
  const parsedSuggestion = parseSuggestionMessage(content);
  if (parsedSuggestion.hasSuggestionContext) {
    return {
      contextType: 'suggestion',
      issue: parsedSuggestion.issue,
      suggestedFix: parsedSuggestion.suggestedFix,
      question: parsedSuggestion.question,
    };
  }

  const parsedSelection = parseSelectionMessage(content);
  if (parsedSelection.hasSelectionContext) {
    return {
      contextType: 'selection',
      selectedSnippet: parsedSelection.selectedSnippet,
      question: parsedSelection.question,
    };
  }

  return {
    contextType: 'none',
    question: content.trim(),
  };
}

interface ConversationPopoverProps {
  messages: ChatMessage[];
  isSending: boolean;
  quirkyMessage: QuirkyMessage | null;
  discussingContext: DiscussingContext | null;
  selectedContext: string | null;
  onClose: () => void;
  onClearDiscussingContext: () => void;
  onClearSelectedContext: () => void;
}

export function ConversationPopover({
  messages,
  isSending,
  quirkyMessage,
  discussingContext,
  selectedContext,
  onClose,
  onClearDiscussingContext,
  onClearSelectedContext,
}: ConversationPopoverProps) {
  const conversationRef = useRef<HTMLDivElement>(null);
  const userBubbleClass =
    'inline-block max-w-[85%] bg-tertiary text-tertiary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-left';

  // Keep latest content in view (messages + compose context banners).
  useEffect(() => {
    if (!conversationRef.current) return;
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, selectedContext, discussingContext]);

  return (
    <div
      ref={conversationRef}
      data-testid="conversation-popover"
      className="max-h-[28rem] overflow-y-auto rounded-lg bg-[#1e1e1e] border border-white/5 shadow-[0_12px_32px_rgba(0,0,0,0.42),0_4px_14px_rgba(0,0,0,0.28),0_0_0_1px_rgba(255,255,255,0.06)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#1e1e1e] z-10">
        <span className="text-sm font-medium text-muted-foreground">Conversation</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {messages.map((msg) => {
          if (msg.role === 'user') {
            const parsed = parseUserMessage(msg.content);

            if (parsed.contextType !== 'none') {
              return (
                <div key={msg.id} className="text-right">
                  <div className={userBubbleClass}>
                    {parsed.contextType === 'selection' && parsed.selectedSnippet && (
                      <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 mb-2">
                        <p className="text-sm italic text-tertiary-foreground/95 break-words">
                          {parsed.selectedSnippet}
                        </p>
                      </div>
                    )}
                    {parsed.contextType === 'suggestion' && (parsed.issue || parsed.suggestedFix) && (
                      <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 mb-2">
                        {parsed.issue && (
                          <p className="text-sm italic text-tertiary-foreground/95 break-words">
                            {parsed.issue}
                          </p>
                        )}
                        {parsed.suggestedFix && (
                          <p className="mt-2 text-xs text-tertiary-foreground/85 break-words">
                            <span className="font-semibold text-tertiary-foreground/95">Previous suggestion:</span>{' '}
                            {parsed.suggestedFix}
                          </p>
                        )}
                      </div>
                    )}
                    {parsed.question && (
                      <p className="text-sm leading-relaxed text-tertiary-foreground">{parsed.question}</p>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="text-right">
                <div className={userBubbleClass}>
                  <p className="text-sm">{msg.content}</p>
                  {msg.suggestionId && (
                    <div className="mt-1.5 text-[10px] text-tertiary-foreground/70 italic flex items-center gap-1">
                      <span>Related to suggestion</span>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id}>
              <div className="text-sm text-foreground/90 leading-relaxed prose prose-invert prose-sm max-w-none">
                <ChatMarkdown content={msg.content} />
              </div>
            </div>
          );
        })}

        {/* Keep active context adjacent to the newest messages/input area. */}
        {selectedContext && (
          <div className="border border-primary/20 bg-linear-to-br from-primary/10 to-primary/5 rounded-xl p-3 group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 block mb-1">
                  Replying to selected text:
                </span>
                <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                  <p className="text-sm text-foreground/85 leading-snug line-clamp-3 italic break-words">
                    "{selectedContext}"
                  </p>
                </div>
              </div>
              <button
                onClick={onClearSelectedContext}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-primary/20 transition-all shrink-0"
                title="Clear selection context"
              >
                <XMarkIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </div>
        )}

        {/* Active discuss context card (matches selected-text context presentation). */}
        {discussingContext && (
          <div className="border border-primary/20 bg-linear-to-br from-primary/10 to-primary/5 rounded-xl p-3 group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 block mb-1">
                  Replying to review item:
                </span>
                <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                  <p className="text-sm text-foreground/85 leading-snug line-clamp-3 italic break-words">
                    "{discussingContext.issue}"
                  </p>
                  {discussingContext.suggestedFix && (
                    <p className="mt-2 text-xs text-foreground/70 leading-snug break-words">
                      <span className="font-semibold text-foreground/80">Suggested fix:</span>{' '}
                      <span className="text-success/80">{discussingContext.suggestedFix}</span>
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClearDiscussingContext}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-primary/20 transition-all shrink-0"
                title="Clear context"
              >
                <XMarkIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </div>
        )}

        {isSending && (
          <div className="text-sm">
            <span className="animate-text-shimmer font-medium">
              {quirkyMessage?.text || 'Thinking...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
