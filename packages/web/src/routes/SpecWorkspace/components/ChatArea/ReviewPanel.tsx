import { useState } from 'react';
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { BotIcon } from 'lucide-react';
import type { Suggestion, SuggestionTag } from '../../../../components/specs/types';
import { getSuggestionLocation } from '../../../../components/specs/types';
import { Button } from '../../../../components/ui/Button';

interface ReviewPanelProps {
  suggestions: Suggestion[];
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  onDiscuss: (suggestion: Suggestion) => void;
  onReviewDiff?: (suggestion: Suggestion) => void;
  onDismissAll: () => void;
  onClose: () => void;
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
  critical: { dot: 'bg-error', label: 'Critical', bg: 'bg-error/5' },
  warning: { dot: 'bg-warning', label: 'Warning', bg: '' },
  info: { dot: 'bg-info', label: 'Suggestion', bg: '' },
};

function ReviewItem({
  suggestion,
  onResolve,
  onDiscuss,
  onReviewDiff,
}: {
  suggestion: Suggestion;
  onResolve: (id: string) => void;
  onDiscuss: (suggestion: Suggestion) => void;
  onReviewDiff?: (suggestion: Suggestion) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const severity = severityConfig[suggestion.severity];
  const primaryTag = suggestion.tags?.[0];
  const tagIcon = primaryTag ? tagIcons[primaryTag] : null;
  const location = getSuggestionLocation(suggestion);

  const hasCodeFix =
    suggestion.type === 'change' ||
    (suggestion.suggestedFix &&
      suggestion.suggestedFix.trim() !== suggestion.issue.trim() &&
      suggestion.suggestedFix.length < 500);



  return (
    <div className={`border-b border-white/5 last:border-b-0 ${severity.bg}`}>
      {/* Left accent */}
      <div className="relative pl-3">
        <div className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${severity.dot}`} />

        <div className="py-3 pr-3">
          {/* Header */}
          <div className="flex items-start gap-2">
            {tagIcon && <span className="text-sm shrink-0">{tagIcon}</span>}
            <div className="flex-1 min-w-0">
              {/* Meta */}
              <div className="flex items-center gap-2 mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                <span className={`w-1.5 h-1.5 rounded-full ${severity.dot}`} />
                <span className="font-medium">{severity.label}</span>
                {location.section && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="truncate">{location.section}</span>
                  </>
                )}
              </div>

              {/* Issue */}
              <p className="text-[13px] text-foreground/90 leading-relaxed">{suggestion.issue}</p>

              {/* Expand toggle */}
              {hasCodeFix && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-2 h-auto p-0 text-[11px] hover:bg-transparent text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <span>{isExpanded ? 'Hide change' : 'Show change'}</span>
                  <ChevronDownIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </Button>
              )}

              {/* Diff */}
              {isExpanded && hasCodeFix && (
                <div className="mt-2 rounded bg-success/10 border border-success/20 overflow-hidden">
                  <div className="px-3 py-2 text-[11px] font-mono text-success/90">
                    + {suggestion.suggestedFix}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                {onReviewDiff && hasCodeFix && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onReviewDiff(suggestion)}
                    className="h-auto px-2.5 py-1 text-[11px] font-medium"
                  >
                    Review
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onDiscuss(suggestion)}
                  data-conversation-keep-open
                  className="h-auto px-2.5 py-1 text-[11px] font-medium"
                >
                  Discuss
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onResolve(suggestion.id)}
                  className="h-auto px-2.5 py-1 text-[11px] font-medium ml-auto"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReviewPanel({
  suggestions,
  onResolve,
  onDiscuss,
  onReviewDiff,
  onDismissAll,
  onClose,
}: ReviewPanelProps) {
  const pending = suggestions.filter((s) => s.status === 'pending');
  const critical = pending.filter((s) => s.severity === 'critical');
  const warning = pending.filter((s) => s.severity === 'warning');
  const info = pending.filter((s) => s.severity === 'info');
  const grouped = [...critical, ...warning, ...info];

  if (pending.length === 0) {
    return (
      <div className="w-80 h-full border-l border-white/6 bg-[#141414] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
          <div className="flex items-center gap-2">
            <BotIcon className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Review</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-muted-foreground text-center">All suggestions reviewed ✓</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 h-full border-l border-white/6 bg-[#141414] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <BotIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Review</span>
          <span className="text-xs text-muted-foreground">{pending.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Severity badges */}
          <div className="flex items-center gap-1">
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
            {info.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info font-medium">
                {info.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map((suggestion) => (
          <ReviewItem
            key={suggestion.id}
            suggestion={suggestion}
            onResolve={onResolve}
            onDiscuss={onDiscuss}
            onReviewDiff={onReviewDiff}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-white/6 bg-[#141414]">
        <span className="text-[11px] text-muted-foreground">
          {pending.length} pending
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismissAll}
          className="h-auto p-0 text-[11px] text-muted-foreground hover:text-foreground hover:bg-transparent"
        >
          Dismiss all
        </Button>
      </div>
    </div>
  );
}
