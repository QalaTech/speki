import { useState } from 'react';
import { CheckIcon, XMarkIcon, ChatBubbleLeftIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { BotIcon } from 'lucide-react';
import type { Suggestion, SuggestionTag } from '../../../../components/specs/types';

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
  onReject: (id: string) => void;
  onDiscuss: (suggestion: Suggestion) => void;
}

const tagIcons: Record<SuggestionTag, string> = {
  security: '🔒',
  performance: '⚡',
  scalability: '📈',
  data: '🗄️',
  api: '🔌',
  ux: '🎨',
  accessibility: '♿',
  architecture: '🏗️',
  testing: '🧪',
  infrastructure: '☁️',
  'error-handling': '🛡️',
  documentation: '📚',
};

const severityConfig = {
  critical: { dot: 'bg-error', label: 'Critical' },
  warning: { dot: 'bg-warning', label: 'Warning' },
  info: { dot: 'bg-info', label: 'Suggestion' },
};

function SuggestionCard({
  suggestion,
  onReject,
  onDiscuss,
}: {
  suggestion: Suggestion;
  onReject: (id: string) => void;
  onDiscuss: (suggestion: Suggestion) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const severity = severityConfig[suggestion.severity];
  const primaryTag = suggestion.tags?.[0];
  const tagIcon = primaryTag ? tagIcons[primaryTag] : null;

  // Only show code fix if there's an actual change
  const hasCodeFix =
    suggestion.type === 'change' ||
    (suggestion.suggestedFix &&
      suggestion.suggestedFix.trim() !== suggestion.issue.trim() &&
      suggestion.suggestedFix.length < 500);

  return (
    <div className="group relative border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
      {/* Left accent line */}
      <div className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-full ${severity.dot}`} />

      <div className="pl-4 pr-3 py-3">
        {/* Header: Icon + Meta */}
        <div className="flex items-start gap-2">
          {tagIcon && (
            <span className="flex-shrink-0 text-sm mt-0.5">{tagIcon}</span>
          )}

          <div className="flex-1 min-w-0">
            {/* Meta row */}
            <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${severity.dot}`} />
              <span className="font-medium uppercase tracking-wider">{severity.label}</span>
              {suggestion.section && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="truncate">{suggestion.section}</span>
                </>
              )}
            </div>

            {/* Issue text */}
            <p className="text-[13px] text-foreground/90 leading-relaxed pr-16">{suggestion.issue}</p>

            {/* Expandable diff */}
            {hasCodeFix && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 text-[11px] text-primary/80 hover:text-primary flex items-center gap-1 transition-colors"
              >
                <span>{isExpanded ? 'Hide change' : 'Show change'}</span>
                <ChevronDownIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}

            {/* Inline diff */}
            {isExpanded && hasCodeFix && (
              <div className="mt-2 rounded bg-success/10 border border-success/20 overflow-hidden">
                <div className="px-3 py-2 text-[11px] font-mono text-success/90">
                  + {suggestion.suggestedFix}
                </div>
              </div>
            )}
          </div>

          {/* Actions - subtle hover icons */}
          <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onDiscuss(suggestion)}
              className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              title="Discuss"
            >
              <ChatBubbleLeftIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onReject(suggestion.id)}
              className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-error transition-colors"
              title="Dismiss"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center gap-2 mt-2.5 pl-6">
          {hasCodeFix && (
            <button
              onClick={() => onDiscuss(suggestion)}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <CheckIcon className="w-3 h-3" />
              Apply
            </button>
          )}
          <button
            onClick={() => onDiscuss(suggestion)}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            Discuss
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuggestionsPanel({ suggestions, onReject, onDiscuss }: SuggestionsPanelProps) {
  const critical = suggestions.filter((s) => s.severity === 'critical');
  const warning = suggestions.filter((s) => s.severity === 'warning');
  const info = suggestions.filter((s) => s.severity === 'info');
  const groupedSuggestions = [...critical, ...warning, ...info];

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-[#161616] border border-white/[0.08] shadow-2xl overflow-hidden max-h-[28rem] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-[#161616] border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <BotIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">AI Suggestions</span>
          <span className="text-xs text-muted-foreground">{suggestions.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {critical.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/15 text-error font-medium">
              {critical.length}
            </span>
          )}
          {warning.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">
              {warning.length}
            </span>
          )}
        </div>
      </div>

      {/* Suggestions list */}
      <div>
        {groupedSuggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onReject={onReject}
            onDiscuss={onDiscuss}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between px-4 py-2 bg-[#161616] border-t border-white/[0.06]">
        <span className="text-[11px] text-muted-foreground">
          Review suggestions to improve your spec
        </span>
        <button
          onClick={() => suggestions.forEach((s) => onReject(s.id))}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Dismiss all
        </button>
      </div>
    </div>
  );
}
