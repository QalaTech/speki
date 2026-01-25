import type { UserStory } from '../../types';
import { getStoryStatus } from '../../types';
import { Badge } from '../ui';

interface TaskCardProps {
  story: UserStory;
  completedIds: Set<string>;
  expanded: boolean;
  onToggle: () => void;
  isRunning?: boolean;
  blocks: string[];
  highlighted?: boolean;
  onNavigate: (taskId: string) => void;
}

const STATUS_STYLES = {
  completed: {
    border: 'border-l-success',
    bg: 'bg-success/5',
    badge: 'success' as const,
  },
  ready: {
    border: 'border-l-info',
    bg: 'bg-info/5',
    badge: 'info' as const,
  },
  blocked: {
    border: 'border-l-error',
    bg: 'bg-error/5',
    badge: 'error' as const,
  },
};

export function TaskCard({
  story,
  completedIds,
  expanded,
  onToggle,
  isRunning,
  blocks,
  highlighted,
  onNavigate
}: TaskCardProps) {
  const status = getStoryStatus(story, completedIds);
  const missingDeps = story.dependencies.filter(dep => !completedIds.has(dep));
  const satisfiedDeps = story.dependencies.filter(dep => completedIds.has(dep));
  const styles = STATUS_STYLES[status] || STATUS_STYLES.blocked;

  const handleDepClick = (e: React.MouseEvent, depId: string) => {
    e.stopPropagation();
    onNavigate(depId);
  };

  return (
    <div
      id={`task-${story.id}`}
      className={`card card-compact bg-base-200 border border-base-300 border-l-4 cursor-pointer transition-all hover:bg-base-300/50 ${styles.border} ${isRunning ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-100' : ''} ${highlighted ? 'ring-2 ring-warning animate-pulse' : ''}`}
      onClick={onToggle}
    >
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className="flex items-center justify-center w-6 h-6 text-sm">
            {isRunning && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
            {!isRunning && status === 'completed' && <span className="text-success">✓</span>}
            {!isRunning && status === 'ready' && <span className="text-info">▶</span>}
            {!isRunning && status === 'blocked' && <span className="text-error">⏸</span>}
          </div>

          {/* Title section */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs opacity-60">{story.id}</span>
              <span className="font-medium truncate">{story.title}</span>
              {isRunning && (
                <Badge variant="primary" size="xs" className="animate-pulse">
                  IN PROGRESS
                </Badge>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 shrink-0">
            {story.dependencies.length > 0 && (
              <span className={`flex items-center gap-1 text-xs ${missingDeps.length > 0 ? 'text-warning' : 'text-success'}`}>
                <span>↑</span>
                <span>{satisfiedDeps.length}/{story.dependencies.length}</span>
              </span>
            )}
            {blocks.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-error">
                <span>↓</span>
                <span>{blocks.length}</span>
              </span>
            )}
            <Badge variant="neutral" size="xs">P{story.priority}</Badge>
            <Badge variant={isRunning ? 'primary' : styles.badge} size="xs">
              {isRunning ? 'running' : status}
            </Badge>
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 space-y-4 border-t border-base-300 pt-4" onClick={e => e.stopPropagation()}>
            {/* Description */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold opacity-70">Description</h4>
              <p className="text-sm">{story.description}</p>
            </section>

            {/* Dependencies */}
            {story.dependencies.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-semibold opacity-70 flex items-center gap-2">
                  <span className="text-info">↑</span>
                  Depends On ({satisfiedDeps.length}/{story.dependencies.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {story.dependencies.map(dep => (
                    <button
                      key={dep}
                      className={`badge ${completedIds.has(dep) ? 'badge-success' : 'badge-ghost'} badge-sm cursor-pointer hover:opacity-80`}
                      onClick={(e) => handleDepClick(e, dep)}
                      title={`Go to ${dep}`}
                    >
                      {completedIds.has(dep) ? '✓' : '○'} {dep}
                    </button>
                  ))}
                </div>
                {missingDeps.length > 0 && (
                  <div className="alert alert-warning py-2">
                    <span className="text-sm">
                      Blocked by {missingDeps.length} incomplete {missingDeps.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                )}
              </section>
            )}

            {/* Blocks */}
            {blocks.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-semibold opacity-70 flex items-center gap-2">
                  <span className="text-error">↓</span>
                  Blocks ({blocks.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {blocks.map(blockId => (
                    <button
                      key={blockId}
                      className="badge badge-error badge-outline badge-sm cursor-pointer hover:opacity-80"
                      onClick={(e) => handleDepClick(e, blockId)}
                      title={`Go to ${blockId}`}
                    >
                      {blockId}
                    </button>
                  ))}
                </div>
                {status !== 'completed' && (
                  <div className="alert alert-info py-2">
                    <span className="text-sm">
                      Completing this will unblock {blocks.length} {blocks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                )}
              </section>
            )}

            {/* Acceptance Criteria */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold opacity-70">Acceptance Criteria</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {story.acceptanceCriteria.map((criterion, idx) => (
                  <li key={idx}>{criterion}</li>
                ))}
              </ul>
            </section>

            {/* Test Cases */}
            {story.testCases && story.testCases.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-semibold opacity-70">Test Cases</h4>
                <ul className="space-y-1">
                  {story.testCases.map((test, idx) => (
                    <li key={idx}>
                      <code className="text-xs bg-base-300 px-2 py-1 rounded font-mono">{test}</code>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Notes */}
            {story.notes && (
              <section className="space-y-2">
                <h4 className="text-sm font-semibold opacity-70">Notes</h4>
                <p className="text-sm bg-base-300 p-3 rounded-lg">{story.notes}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
