import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { X } from 'lucide-react';

interface StatusBarProps {
  storiesCount: number;
  isPrd: boolean;
  tasksVisible: boolean;
  pendingSuggestionsCount: number;
  isSuggestionsExpanded: boolean;
  onScrollToTasks: () => void;
  onToggleSuggestions: () => void;
  onDismissAllSuggestions: () => void;
}

export function StatusBar({
  storiesCount,
  isPrd,
  tasksVisible,
  pendingSuggestionsCount,
  isSuggestionsExpanded,
  onScrollToTasks,
  onToggleSuggestions,
  onDismissAllSuggestions,
}: StatusBarProps) {
  const hasStories = storiesCount > 0;
  const showTasksIndicator = hasStories && !tasksVisible;
  const showSuggestions = pendingSuggestionsCount > 0;

  if (!showTasksIndicator && !showSuggestions) return null;

  return (
    <div className="relative mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-[#1e1e1e] border border-white/3 transition-all duration-200">
        {/* Left: Tasks indicator */}
        <div className="flex items-center gap-3">
          {showTasksIndicator && (
            <button
              onClick={onScrollToTasks}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDownIcon className="w-4 h-4" />
              <span>
                {storiesCount} {isPrd ? 'stories' : 'tasks'} below
              </span>
            </button>
          )}
        </div>

        {/* Right: Suggestions */}
        {showSuggestions && (
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleSuggestions}
              className="flex items-center gap-2 text-sm text-foreground hover:text-foreground/80 transition-colors"
            >
              <span>
                {pendingSuggestionsCount} change{pendingSuggestionsCount !== 1 ? 's' : ''} suggested
              </span>
              {isSuggestionsExpanded ? (
                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronUpIcon className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onDismissAllSuggestions();
              }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
