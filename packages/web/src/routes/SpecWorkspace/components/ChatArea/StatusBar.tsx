import { ChevronDownIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import { SquareArrowOutUpRightIcon } from 'lucide-react';

interface StatusBarProps {
  storiesCount: number;
  isPrd: boolean;
  tasksVisible: boolean;
  pendingSuggestionsCount: number;
  isReviewPanelOpen: boolean;
  onScrollToTasks: () => void;
  onOpenReviewPanel: () => void;
  queueCount?: number;
  onOpenQueue?: () => void;
}

export function StatusBar({
  storiesCount,
  isPrd,
  tasksVisible,
  pendingSuggestionsCount,
  isReviewPanelOpen,
  onScrollToTasks,
  onOpenReviewPanel,
  queueCount = 0,
  onOpenQueue,
}: StatusBarProps) {
  const hasStories = storiesCount > 0;
  const showSuggestions = pendingSuggestionsCount > 0 && !isReviewPanelOpen;

  return (
    <div className="relative animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2 bg-card border border-border border-b-0 rounded-t-2xl rounded-b-none mx-4 transition-all duration-200">
        {/* Left: Spec Tasks & Global Queue */}
        <div className="flex items-center gap-4">
          {/* Current Spec Tasks */}
          {hasStories && (
            <button
              onClick={onScrollToTasks}
              disabled={tasksVisible}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                !tasksVisible ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/40 cursor-default'
              }`}
            >
              {!tasksVisible && <ChevronDownIcon className="w-3.5 h-3.5" />}
              <span>
                {storiesCount} {isPrd ? (storiesCount > 1 ? 'stories' : 'story') : (storiesCount > 1 ? 'tasks' : 'task')}
                <span className="max-lg:hidden"> below</span>
              </span>
            </button>
          )}

          {/* Separator - desktop only */}
          {hasStories && (
            <div className="hidden lg:block w-px h-3 bg-white/5" />
          )}

          {/* Global Queue Indicator */}
          <button
            onClick={onOpenQueue}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ListBulletIcon className="w-3.5 h-3.5" />
            <span className="max-lg:hidden">View execution queue ({queueCount} total tasks)</span>
            <span className="lg:hidden">{queueCount} in queue</span>
          </button>
        </div>

        {/* Right: Review changes link */}
        {showSuggestions && (
          <button
            onClick={onOpenReviewPanel}
            className="flex items-center gap-2 text-xs font-medium transition-colors group cursor-pointer"
          >
            <span className="text-muted-foreground">
              {pendingSuggestionsCount} comment{pendingSuggestionsCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5 text-foreground bg-white/5 px-2 py-0.5 rounded-md group-hover:bg-white/10 transition-colors">
              <span className="max-lg:hidden">Review</span>
              <SquareArrowOutUpRightIcon className="w-3 h-3" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
