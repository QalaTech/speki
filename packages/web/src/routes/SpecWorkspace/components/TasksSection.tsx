import { useRef, useEffect } from 'react';
import { SparklesIcon, ArrowPathIcon, QueueListIcon, DocumentPlusIcon, PlayIcon } from '@heroicons/react/24/outline';
import { Button } from '../../../components/ui/Button';
import { Spinner, Skeleton } from '../../../components/ui/Loading';
import { Badge } from '../../../components/ui/Badge';
import { UseCaseList } from '../../../components/specs/UseCaseList';
import type { SpecType } from '../../../components/specs/types';
import type {
  UserStory,
  QueuedTaskReference,
  RalphStatus,
  DecomposeFeedback,
  FeedbackItem,
} from '../../../types';

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
  reviewFeedback?: DecomposeFeedback | null;
  reviewVerdict?: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED' | null;
  specStatus?: 'pending' | 'partial' | 'completed' | null;
  specStatusMessage?: string | null;
}

function formatFeedbackItem(item: string | FeedbackItem): string {
  if (typeof item === 'string') return item;
  const parts: string[] = [];
  if (item.severity) parts.push(`[${item.severity.toUpperCase()}]`);
  if (item.taskId) parts.push(`[${item.taskId}]`);
  if (item.taskIds) parts.push(`[${item.taskIds.join(', ')}]`);
  if (item.requirement) parts.push(item.requirement);
  if (item.description) parts.push(item.description);
  if (item.issue) parts.push(item.issue);
  if (item.reason) parts.push(item.reason);
  if (item.action) parts.push(`Action: ${item.action}`);
  if (item.suggestedFix) parts.push(`Fix: ${item.suggestedFix}`);
  if (item.prdSection) parts.push(`(PRD: ${item.prdSection})`);
  if (item.dependsOn) parts.push(`depends on: ${item.dependsOn}`);
  return parts.join(' ');
}

function FeedbackSection({ label, items, icon }: { label: string; items?: (string | FeedbackItem)[]; icon: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span> {label}
        <Badge variant="ghost" size="xs">{items.length}</Badge>
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="text-muted-foreground/40 mt-0.5">•</span>
            <span className="text-foreground/80">{formatFeedbackItem(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewFeedbackPanel({ feedback }: { feedback: DecomposeFeedback }) {
  const hasFeedback =
    (feedback.missingRequirements?.length ?? 0) > 0 ||
    (feedback.contradictions?.length ?? 0) > 0 ||
    (feedback.dependencyErrors?.length ?? 0) > 0 ||
    (feedback.duplicates?.length ?? 0) > 0 ||
    (feedback.suggestions?.length ?? 0) > 0 ||
    (feedback.issues?.length ?? 0) > 0;

  if (!hasFeedback) return null;

  return (
    <div className="bg-muted border border-error/20 rounded-lg p-4 my-3 space-y-4">
      <div className="text-sm font-bold text-error/80">Review Feedback</div>
      <FeedbackSection label="Missing Requirements" items={feedback.missingRequirements} icon="⚠" />
      <FeedbackSection label="Contradictions" items={feedback.contradictions} icon="⊘" />
      <FeedbackSection label="Dependency Errors" items={feedback.dependencyErrors} icon="⛓" />
      <FeedbackSection label="Duplicates" items={feedback.duplicates} icon="⧉" />
      <FeedbackSection label="Suggestions" items={feedback.suggestions} icon="💡" />
      {feedback.issues && feedback.issues.length > 0 && (
        <FeedbackSection label="Other Issues" items={feedback.issues} icon="ℹ" />
      )}
    </div>
  );
}

function TaskListLoadingSkeleton() {
  return (
    <div aria-live="polite" aria-busy="true">
      <div className="use-case-list mt-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="use-case-item">
            <div className="use-case-header grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 py-2.5">
              <div className="use-case-checkbox">
                <Skeleton variant="circle" className="h-3 w-3" />
              </div>
              <Skeleton className="h-6 w-[70px] rounded" />

              <div className="min-w-0">
                <Skeleton className="h-4" width={`${54 + (i % 3) * 12}%`} />
                <div className="mt-1 flex items-center gap-1.5">
                  <Skeleton className="h-4 w-14 rounded-full" />
                </div>
              </div>

              <div className="shrink-0 w-[70px] flex justify-center">
                <Skeleton className="h-5 w-14 rounded" />
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Skeleton variant="circle" className="h-7 w-7" />
                <Skeleton className="h-4 w-4 rounded-sm" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
  reviewFeedback,
  reviewVerdict,
  specStatus,
  specStatusMessage,
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
  const reviewStatusText = reviewVerdict === 'PASS'
    ? 'Reviewed'
    : reviewVerdict === 'FAIL'
      ? 'Needs revision'
      : null;

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
        {hasStories && reviewStatusText && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              reviewVerdict === 'PASS'
                ? 'bg-success/10 text-success'
                : 'bg-warning/10 text-warning'
            }`}
          >
            {reviewStatusText}
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

      {reviewFeedback && reviewVerdict === 'FAIL' && (
        <ReviewFeedbackPanel feedback={reviewFeedback} />
      )}

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
      ) : isDecomposing ? (
        <TaskListLoadingSkeleton />
      ) : (
        <p className="text-muted-foreground text-sm italic py-4">
          No {isPrd ? 'user stories' : 'tasks'} yet. Click Generate to create them.
        </p>
      )}

      {specStatus === 'completed' && stories.length === 0 && (
        <p className="text-success text-sm">
          ✓ {specStatusMessage || 'Spec completed'}
        </p>
      )}
      {specStatus === 'partial' && (
        <p className="text-warning text-sm">
          ○ {specStatusMessage || 'Partially completed'}
        </p>
      )}
    </div>
  );
}
