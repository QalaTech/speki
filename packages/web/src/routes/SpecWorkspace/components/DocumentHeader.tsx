import { formatRelativeTime } from '../utils';

interface DocumentHeaderProps {
  isSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
}

export function DocumentHeader({
  isSaving,
  lastSavedAt,
  hasUnsavedChanges,
}: DocumentHeaderProps) {
  return (
    <div className="flex justify-start mb-6">
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
        ) : <span className="flex items-center gap-1.5 ">
            <span className="w-2 h-2 rounded-full bg-success/60" />
            Ready
          </span>}
      </div>
    </div>
  );
}
