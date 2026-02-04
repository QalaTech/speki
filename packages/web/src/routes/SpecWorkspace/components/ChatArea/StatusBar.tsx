import { ChevronDownIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

interface StatusBarProps {
  storiesCount: number;
  isPrd: boolean;
  tasksVisible: boolean;
  pendingSuggestionsCount: number;
  isReviewPanelOpen: boolean;
  onScrollToTasks: () => void;
  onOpenReviewPanel: () => void;
}

export function StatusBar({
  storiesCount,
  isPrd,
  tasksVisible,
  pendingSuggestionsCount,
  isReviewPanelOpen,
  onScrollToTasks,
  onOpenReviewPanel,
}: StatusBarProps) {
  const hasStories = storiesCount > 0;
  const showTasksIndicator = hasStories && !tasksVisible;
  const showSuggestions = pendingSuggestionsCount > 0 && !isReviewPanelOpen;

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

        {/* Right: Review changes link (Codex-style) */}
        {showSuggestions && (
          <button
            onClick={onOpenReviewPanel}
            className="flex items-center gap-2 text-sm transition-colors group cursor-pointer"
          >
            <span>
              {pendingSuggestionsCount} change{pendingSuggestionsCount !== 1 ? 's' : ''} suggested
            </span>
            <span className="flex items-center gap-1 transition-colors">
              Review changes
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
