import { useRef, useEffect } from 'react';
import { SparklesIcon, ArrowPathIcon, QueueListIcon, DocumentPlusIcon, PlayIcon } from '@heroicons/react/24/outline';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Loading';
import { UseCaseList } from '../../../components/specs/UseCaseList';
import type { SpecType } from '../../../components/specs/types';
import type { UserStory, QueuedTaskReference, RalphStatus } from '../../../types';

interface TasksSectionProps {
  stories: UserStory[];
  completedIds: Set<string>;
  queueTasks: QueuedTaskReference[];
  queueLoading: Set<string>;
  specType: SpecType;
  isPrd: boolean;
  isDecomposing: boolean;
  isLoadingContent: boolean;
  isGeneratingTechSpec: boolean;
  ralphStatus?: RalphStatus;
  onDecompose: (force: boolean) => void;
  onAddToQueue: (taskId: string) => void;
  onRemoveFromQueue: (taskId: string) => void;
  onAddAllToQueue: () => void;
  onSaveTask: (task: UserStory) => Promise<void>;
  onRunQueue: () => void;
  onViewLive: () => void;
  onCreateTechSpec: () => void;
  onTasksVisibilityChange: (visible: boolean) => void;
  getQueuedTaskStatus?: (taskId: string) => QueuedTaskReference['status'];
}

export function TasksSection({
  stories,
  completedIds,
  queueTasks,
  queueLoading,
  specType,
  isPrd,
  isDecomposing,
  isLoadingContent,
  isGeneratingTechSpec,
  ralphStatus,
  onDecompose,
  onAddToQueue,
  onRemoveFromQueue,
  onAddAllToQueue,
  onSaveTask,
  onRunQueue,
  onViewLive,
  onCreateTechSpec,
  onTasksVisibilityChange,
  getQueuedTaskStatus: getQueuedTaskStatusProp,
}: TasksSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const hasStories = stories.length > 0;
  const isRunning = ralphStatus?.running;

  // Track visibility using IntersectionObserver
  useEffect(() => {
    if (!sectionRef.current || !onTasksVisibilityChange) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        onTasksVisibilityChange(entry.isIntersecting);
      },
      {
        root: sectionRef.current?.parentElement?.parentElement || null,
        threshold: 0.1,
      }
    );

    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [hasStories, onTasksVisibilityChange]);

  const isTaskQueued = (taskId: string) => queueTasks.some(t => t.taskId === taskId);

  const getQueuePosition = (taskId: string) => {
    const pending = queueTasks.filter(t => t.status === 'queued' || t.status === 'running');
    const idx = pending.findIndex(t => t.taskId === taskId);
    return idx >= 0 ? idx + 1 : null;
  };

  const getQueuedTaskStatus = (taskId: string) =>
    getQueuedTaskStatusProp ? getQueuedTaskStatusProp(taskId) : (queueTasks.find(t => t.taskId === taskId)?.status || 'pending');

  const title = isPrd ? 'User Stories' : 'Tasks';

  return (
    <div ref={sectionRef} id="tasks-section" className="mb-8 scroll-mt-8">
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-3 pb-[0.5em] border-b border-border/70">
        <h2
          className="m-0 text-[1.5em] font-semibold font-[Poppins,system-ui,sans-serif] tracking-[-0.02em] leading-tight"
          style={{ color: '#7AB0F9' }}
        >
          {title}
        </h2>
        {hasStories && (
          <span className="text-muted-foreground text-sm">
            {completedIds.size}/{stories.length}
          </span>
        )}
        {isLoadingContent && !hasStories && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
        )}
        <div className="flex-1" />

        {/* Action buttons */}
        {isDecomposing ? (
          <div className="flex items-center gap-2 text-primary text-xs h-6 px-2">
            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Generating...</span>
          </div>
        ) : hasStories ? (
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button
                variant="primary"
                size="sm"
                onClick={onViewLive}
                className="h-7 text-xs bg-primary/20 hover:bg-primary/30 text-primary border-none"
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  View Live
                </div>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDecompose(true)}
              className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
            >
              <ArrowPathIcon className="h-3 w-3 mr-1" />
              Regenerate
            </Button>

            {specType === 'tech-spec' && (
              <>
                {!isRunning && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onAddAllToQueue}
                    disabled={stories.every(s => s.passes || isTaskQueued(s.id))}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <QueueListIcon className="h-3.5 w-3.5 mr-1" />
                    Queue All
                  </Button>
                )}
                {queueTasks.some(t => t.status === 'queued') && !isRunning && (
                  <Button variant="primary" size="sm" onClick={onRunQueue} className="h-7 text-xs">
                    <PlayIcon className="h-3.5 w-3.5 mr-1" />
                    Run Queue
                  </Button>
                )}
              </>
            )}

            {isPrd && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCreateTechSpec}
                disabled={isGeneratingTechSpec}
                className="h-7 text-xs text-primary"
              >
                {isGeneratingTechSpec ? (
                  <Spinner size="xs" className="mr-1 text-primary" />
                ) : (
                  <DocumentPlusIcon className="h-3.5 w-3.5 mr-1" />
                )}
                Generate Tech Spec
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDecompose(false)}
            className="h-7 text-xs text-primary"
          >
            <SparklesIcon className="h-3.5 w-3.5 mr-1" />
            Generate {isPrd ? 'Stories' : 'Tasks'}
          </Button>
        )}
      </div>

      {/* Task list */}
      {hasStories ? (
        <UseCaseList
          stories={stories}
          completedIds={completedIds}
          specType={specType}
          isQueued={isTaskQueued}
          getQueuePosition={getQueuePosition}
          getQueuedTaskStatus={getQueuedTaskStatus}
          onAddToQueue={onAddToQueue}
          onRemoveFromQueue={onRemoveFromQueue}
          queueLoading={queueLoading}
          onSaveTask={onSaveTask}
        />
      ) : !isDecomposing ? (
        <p className="text-muted-foreground text-sm italic py-4">
          No {isPrd ? 'user stories' : 'tasks'} yet. Click Generate to create them.
        </p>
      ) : null}
    </div>
  );
}
