import type { UserStory } from '../../types';
import { getStoryStatus } from '../../types';
import { TaskInfoPanel } from '../shared/TaskInfoPanel';
import { Button } from '../ui/Button';

interface TaskDrawerProps {
  story: UserStory | null;
  completedIds: Set<string>;
  blocksMap: Map<string, string[]>;
  logContent: string;
  onClose: () => void;
}

const STATUS_CONFIG = {
  completed: { label: 'Completed', color: 'text-success', bg: 'bg-success/10', icon: '✓' },
  ready: { label: 'Ready', color: 'text-info', bg: 'bg-info/10', icon: '▶' },
  blocked: { label: 'Blocked', color: 'text-error', bg: 'bg-error/10', icon: '⏸' },
  pending: { label: 'Pending', color: 'text-base-content/60', bg: 'bg-base-300', icon: '○' },
};

const COMPLEXITY_CONFIG = {
  high: { color: 'text-error', bg: 'bg-error/10' },
  medium: { color: 'text-warning', bg: 'bg-warning/10' },
  low: { color: 'text-success', bg: 'bg-success/10' },
};

export function TaskDrawer({ story, completedIds, blocksMap, onClose }: TaskDrawerProps) {
  if (!story) return null;

  const status = getStoryStatus(story, completedIds);
  const blocks = blocksMap.get(story.id) || [];
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const complexityConfig = story.complexity ? COMPLEXITY_CONFIG[story.complexity] : null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg h-full bg-base-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-base-300 bg-base-200/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
                <span>{statusConfig.icon}</span>
                {statusConfig.label}
              </span>
              {complexityConfig && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${complexityConfig.bg} ${complexityConfig.color}`}>
                  {story.complexity}
                </span>
              )}
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                story.priority === 1 ? 'bg-error/10 text-error' :
                story.priority === 2 ? 'bg-warning/10 text-warning' :
                'bg-info/10 text-info'
              }`}>
                P{story.priority}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full hover:bg-base-300"
              onClick={onClose}
              aria-label="Close drawer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-base-content/50 bg-base-300/50 px-2 py-0.5 rounded">
              {story.id}
            </span>
          </div>
          <h2 className="text-lg font-bold mt-2">{story.title}</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <TaskInfoPanel
            story={story}
            completedIds={completedIds}
            blocks={blocks}
          />
        </div>
      </div>
    </div>
  );
}
