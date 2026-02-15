import { formatRelativeTime } from '../utils';
import { SidebarTrigger } from '../../../components/ui/sidebar';

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
    <div className="lg:hidden flex items-center justify-start mb-2 gap-2">
      {/* Sidebar toggle - visible on tablet and below */}
      <div className="lg:hidden">
        <SidebarTrigger />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {isSaving ? (
          <span className="flex items-center gap-1.5 text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Saving...
          </span>
        ) : lastSavedAt ? (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success/60" />
            Saved {formatRelativeTime(lastSavedAt)}
          </span>
        ) : hasUnsavedChanges ? (
          <span className="flex items-center gap-1.5 text-warning">
            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
            Unsaved
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success/60" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
