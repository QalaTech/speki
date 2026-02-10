import { SparklesIcon } from '@heroicons/react/24/outline';
import type { SpecType } from '../../../components/specs/types';
import { formatRelativeTime } from '../utils';

interface DocumentHeaderProps {
  title: string;
  specType: SpecType;
  storiesCount: number;
  isPrd: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
  onScrollToStories: () => void;
}

export function DocumentHeader({
  title,
  specType,
  storiesCount,
  isPrd,
  isSaving,
  lastSavedAt,
  hasUnsavedChanges,
  onScrollToStories,
}: DocumentHeaderProps) {
  const hasStories = storiesCount > 0;

  const getSpecTypeStyles = (type: SpecType) => {
    switch (type) {
      case 'prd':
        return 'bg-info/15 text-info';
      case 'tech-spec':
        return 'bg-primary/15 text-primary';
      case 'bug':
        return 'bg-error/15 text-error';
      default:
        return 'bg-info/15 text-info';
    }
  };

  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">
            {title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md ${getSpecTypeStyles(specType)}`}
            >
              {specType.toUpperCase()}
            </span>
            {hasStories && (
              <button
                onClick={onScrollToStories}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <SparklesIcon className="w-3 h-3" />
                <span>
                  {storiesCount} {isPrd ? storiesCount === 1 ? 'story' : 'stories' : storiesCount === 1 ? 'task' : 'tasks'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
        {isSaving ? (
          <span className="flex items-center gap-1.5 text-primary">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Saving...
          </span>
        ) : lastSavedAt ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success/60" />
            Saved {formatRelativeTime(lastSavedAt)}
          </span>
        ) : hasUnsavedChanges ? (
          <span className="flex items-center gap-1.5 text-warning">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            Unsaved
          </span>
        ) : null}
      </div>
    </div>
  );
}
