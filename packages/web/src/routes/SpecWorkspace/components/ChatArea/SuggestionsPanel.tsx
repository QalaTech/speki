
import type { Suggestion } from '../../../../components/specs/types';

interface SuggestionsPanelProps {
  suggestions: Suggestion[];

  onReject: (id: string) => void;
  onDiscuss: (suggestion: Suggestion) => void;
}

export function SuggestionsPanel({
  suggestions,
  onReject,
  onDiscuss,
}: SuggestionsPanelProps) {
  const isActionable = (suggestion: Suggestion) => {
    return (
      suggestion.type === 'change' ||
      (suggestion.suggestedFix &&
        suggestion.suggestedFix.trim() !== suggestion.issue.trim() &&
        !suggestion.suggestedFix.toLowerCase().includes('consider') &&
        !suggestion.suggestedFix.toLowerCase().includes('should') &&
        suggestion.suggestedFix.length < 500)
    );
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-[#1e1e1e] border border-white/3 shadow-2xl overflow-hidden max-h-80 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
      {suggestions.map((suggestion) => {
        const actionable = isActionable(suggestion);

        return (
          <div key={suggestion.id} className="border-b border-white/5 last:border-b-0">
            {actionable ? (
              <>
                {/* Actionable change - show diff view */}
                <div className="flex items-center justify-between px-4 py-2 bg-[#252525]">
                  <span className="text-xs text-muted-foreground font-mono">spec content</span>
                  <span className="text-xs text-success">+1 -1</span>
                </div>
                <div className="font-mono text-xs">
                  <div className="flex items-start bg-warning/10">
                    <span className="w-10 px-2 py-1 text-right text-warning/50 select-none border-r border-white/5">
                      !
                    </span>
                    <span className="flex-1 px-3 py-1 text-warning/80">{suggestion.issue}</span>
                  </div>
                  <div className="flex items-start bg-success/10">
                    <span className="w-10 px-2 py-1 text-right text-success/50 select-none border-r border-white/5">
                      +
                    </span>
                    <span className="flex-1 px-3 py-1 text-success">{suggestion.suggestedFix}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a]">
                  <span className="text-xs text-muted-foreground">
                    {suggestion.section || 'Document'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDiscuss(suggestion)}
                      className="px-2 py-1 text-xs rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
                    >
                      Discuss
                    </button>
                    <button
                      onClick={() => onReject(suggestion.id)}
                      className="px-2 py-1 text-xs rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Comment/Advisory - show recommendation only */}
                <div className="flex items-center justify-between px-4 py-2 bg-[#252525]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-info">💡 Recommendation</span>
                    <span className="text-xs text-muted-foreground">
                      {suggestion.section || 'Document'}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3 text-sm text-foreground/90 leading-relaxed">
                  <p className="font-medium text-foreground mb-1">{suggestion.issue}</p>
                  {suggestion.suggestedFix && suggestion.suggestedFix !== suggestion.issue && (
                    <p className="text-muted-foreground text-xs mt-2">{suggestion.suggestedFix}</p>
                  )}
                </div>
                <div className="flex items-center justify-end px-4 py-2 bg-[#1a1a1a] gap-1">
                  <button
                    onClick={() => onDiscuss(suggestion)}
                    className="px-2 py-1 text-xs rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
                  >
                    Discuss
                  </button>
                  <button
                    onClick={() => onReject(suggestion.id)}
                    className="px-2 py-1 text-xs rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
