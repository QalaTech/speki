import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { SquareArrowOutUpRightIcon } from 'lucide-react';

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
    <div className="relative animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] border border-white/10 border-b-0 rounded-t-2xl rounded-b-none mx-4 transition-all duration-200">
        {/* Left: Tasks indicator */}
        <div className="flex items-center gap-3">
          {showTasksIndicator && (
            <button
              onClick={onScrollToTasks}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDownIcon className="w-3.5 h-3.5" />
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
            className="flex items-center gap-3 text-xs font-medium transition-colors group cursor-pointer"
          >
            <span className="text-muted-foreground">
              {pendingSuggestionsCount} change{pendingSuggestionsCount !== 1 ? 's' : ''} suggested
            </span>
            <span className="flex items-center gap-1.5 text-foreground bg-white/5 px-2 py-0.5 rounded-md group-hover:bg-white/10 transition-colors">
              Review
              <SquareArrowOutUpRightIcon className="w-3 h-3" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
