import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { ChatLogView } from '../../../components/chat/ChatLogView';
import type { ParsedEntry } from '../../../utils/parseJsonl';
import type {
  RalphStatus,
  UserStory,
  QueuedTaskReference,
  PeerFeedback,
  PeerFeedbackCategory,
} from '../../../types';
import { Badge } from '../../../components/ui';
import { Button } from '../../../components/ui/Button';
import { StopCircleIcon, PlayIcon, ChevronRightIcon, XIcon, Loader2Icon } from 'lucide-react';

interface ExecutionLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  ralphStatus: RalphStatus;
  logEntries: ParsedEntry[];
  onStopExecution: () => void;
  onResumeExecution?: () => void;
  onNavigateToSpec?: (specId: string) => void;
  onRemoveTaskFromQueue?: (specId: string, taskId: string) => Promise<void> | void;
  removingQueueTaskKeys?: Set<string>;
  stories?: UserStory[];
  queueTasks?: QueuedTaskReference[];
  completedIds?: Set<string>;
  peerFeedback?: PeerFeedback | null;
  onRefreshLessons?: () => void;
}

const categoryLabels: Record<PeerFeedbackCategory, string> = {
  architecture: 'Architecture',
  testing: 'Testing',
  api: 'API',
  database: 'Database',
  performance: 'Performance',
  security: 'Security',
  tooling: 'Tooling',
  patterns: 'Patterns',
  gotchas: 'Gotchas',
};

const categoryVariants: Record<
  PeerFeedbackCategory,
  'primary' | 'success' | 'secondary' | 'error' | 'warning' | 'info' | 'ghost' | 'neutral'
> = {
  architecture: 'info',
  testing: 'success',
  api: 'secondary',
  database: 'error',
  performance: 'warning',
  security: 'error',
  tooling: 'ghost',
  patterns: 'info',
  gotchas: 'warning',
};

export function ExecutionLiveModal({
  isOpen,
  onClose,
  ralphStatus,
  logEntries,
  onStopExecution,
  onResumeExecution,
  onNavigateToSpec,
  onRemoveTaskFromQueue,
  removingQueueTaskKeys = new Set(),
  stories = [],
  queueTasks = [],
  completedIds = new Set(),
  peerFeedback = null,
  onRefreshLessons,
}: ExecutionLiveModalProps) {
  const isRunning = ralphStatus.running;
  const currentStoryId = ralphStatus.currentStory?.split(':')[0]?.trim();
  
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'activity' | 'lessons'>('activity');
  const [selectedLessonCategory, setSelectedLessonCategory] = useState<PeerFeedbackCategory | 'all'>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const activeQueueTasks = useMemo(
    () => queueTasks.filter((task) => task.status === 'queued' || task.status === 'running'),
    [queueTasks]
  );
  const queueStatusByTaskId = useMemo(
    () => new Map(queueTasks.map((task) => [task.taskId, task.status])),
    [queueTasks]
  );
  const queueSpecByTaskId = useMemo(
    () => new Map(activeQueueTasks.map((task) => [task.taskId, task.specId])),
    [activeQueueTasks]
  );

  // Auto-select running task
  useEffect(() => {
    if (isRunning && currentStoryId) {
      setSelectedStoryId(currentStoryId);
    }
  }, [currentStoryId, isRunning]);

  useEffect(() => {
    if (!selectedStoryId) return;
    const stillQueued = activeQueueTasks.some((task) => task.taskId === selectedStoryId);
    if (!stillQueued && selectedStoryId !== currentStoryId) {
      setSelectedStoryId(activeQueueTasks[0]?.taskId ?? null);
    }
  }, [activeQueueTasks, currentStoryId, selectedStoryId]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('activity');
      setSelectedLessonCategory('all');
    }
  }, [isOpen]);

  // Group stories by Spec
  const groupedStories = useMemo(() => {
    const queuedTaskIds = new Set(activeQueueTasks.map((task) => task.taskId));
    const queueOrder = new Map(activeQueueTasks.map((task, index) => [task.taskId, index]));
    
    // Ensure activeTasks are unique by ID and include current running task if missing from queue cache.
    const uniqueActiveTasksMap = new Map<string, UserStory>();
    stories
      .filter((story) => queuedTaskIds.has(story.id) || (isRunning && story.id === currentStoryId))
      .forEach((story) => uniqueActiveTasksMap.set(story.id, story));
    
    const activeTasks = Array.from(uniqueActiveTasksMap.values());
    
    const groups: Record<string, UserStory[]> = {};
    const taskToSpec = new Map<string, string>();
    activeQueueTasks.forEach((task) => taskToSpec.set(task.taskId, task.specId));

    activeTasks.forEach(story => {
      const specId = taskToSpec.get(story.id) || story.id.split('-')[0] || 'Unknown';
      if (!groups[specId]) groups[specId] = [];
      groups[specId].push(story);
    });

    const sortedGroups = Object.entries(groups).map(([specId, stories]) => ({
      specId,
      stories: stories.sort((a, b) => {
        const getOrder = (id: string) => {
          if (id === currentStoryId) return 0;
          return (queueOrder.get(id) ?? Number.MAX_SAFE_INTEGER) + 1;
        };
        return getOrder(a.id) - getOrder(b.id);
      })
    })).sort((a, b) => {
      const aHasRunning = a.stories.some(s => s.id === currentStoryId);
      const bHasRunning = b.stories.some(s => s.id === currentStoryId);
      if (aHasRunning) return -1;
      if (bHasRunning) return 1;
      return a.specId.localeCompare(b.specId);
    });

    return {
      groups: sortedGroups,
      totalCount: activeTasks.length
    };
  }, [stories, activeQueueTasks, currentStoryId, isRunning]);

  // Scroll to selected task
  useEffect(() => {
    if (selectedStoryId && listRef.current) {
      const el = listRef.current.querySelector(`[data-story-id="${selectedStoryId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedStoryId, isOpen]);

  const getTaskStatus = (id: string) => {
    if (id === currentStoryId) return 'running';
    const queueStatus = queueStatusByTaskId.get(id);
    if (queueStatus) return queueStatus;
    if (completedIds.has(id)) return 'completed';
    return 'pending';
  };

  const selectedStoryTitle = stories.find(s => s.id === selectedStoryId)?.title || selectedStoryId;

  const lessonsLearned = useMemo(() => peerFeedback?.lessonsLearned ?? [], [peerFeedback]);
  const categoriesWithLessons = useMemo(
    () => [...new Set(lessonsLearned.map((lesson) => lesson.category))],
    [lessonsLearned]
  );
  const filteredLessons = useMemo(
    () =>
      selectedLessonCategory === 'all'
        ? lessonsLearned
        : lessonsLearned.filter((lesson) => lesson.category === selectedLessonCategory),
    [lessonsLearned, selectedLessonCategory]
  );

  const formatLessonDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isRunning ? 'Live Execution' : 'Execution Log'}
      size="xl"
      className="h-[85vh] flex flex-col max-w-6xl w-full"
      actions={
        <div className="flex justify-between w-full items-center">
          <div className="flex items-center gap-3">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Iteration {ralphStatus.currentIteration}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Execution stopped</span>
            )}
          </div>
          <div className="flex gap-2">
            {!isRunning && onResumeExecution && queueTasks.some(t => t.status === 'queued') && (
              <Button variant="primary" size="sm" onClick={onResumeExecution} className="gap-1.5">
                <PlayIcon className="w-4 h-4" />
                Resume
              </Button>
            )}
            {isRunning && (
              <Button variant="ghost" size="sm" onClick={onStopExecution} className="text-error hover:text-error hover:bg-error/10 gap-1.5">
                <StopCircleIcon className="w-4 h-4" />
                Stop
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full min-h-0 animate-stagger-in">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'activity'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground border border-transparent hover:bg-white/5'
            }`}
          >
            Live Activity
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('lessons');
              onRefreshLessons?.();
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'lessons'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground border border-transparent hover:bg-white/5'
            }`}
          >
            Lessons Learned
            {lessonsLearned.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-80">({lessonsLearned.length})</span>
            )}
          </button>
        </div>

        {activeTab === 'activity' ? (
          <div className="flex h-full min-h-0 border border-border/30 rounded-lg overflow-hidden bg-card/30">
            {/* Left: Task Queue List */}
            <div className="w-72 border-r border-border/30 flex flex-col bg-secondary/10 shrink-0">
              <div className="px-4 py-3 border-b border-border/30 bg-secondary/20 flex justify-between items-center">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Execution Queue</h3>
                <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground">
                  {groupedStories.totalCount} tasks
                </span>
              </div>
              <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-4">
                {groupedStories.groups.length === 0 ? (
                  <div className="text-center p-4 text-xs text-muted-foreground">No tasks in queue</div>
                ) : (
                  groupedStories.groups.map(group => {
                    const isGroupActive = group.stories.some(s => s.id === currentStoryId);
                    
                    return (
                      <div key={group.specId} className="space-y-1">
                        <button
                          onClick={() => onNavigateToSpec?.(group.specId)}
                          className={`
                            w-full flex items-center justify-between px-2 py-1.5 rounded-md group/header transition-colors
                            ${onNavigateToSpec ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}
                          `}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-bold uppercase tracking-tight truncate ${isGroupActive ? 'text-primary' : 'text-muted-foreground/60'}`}>
                              {group.specId}
                            </span>
                          </div>
                          {onNavigateToSpec && (
                            <ChevronRightIcon className="w-3 h-3 text-muted-foreground/0 group-hover/header:text-muted-foreground/40 transition-all" />
                          )}
                        </button>
                        
                        <div className="space-y-1 pl-1">
                          {group.stories.map(story => {
                            const status = getTaskStatus(story.id);
                            const isSelected = selectedStoryId === story.id;
                            const compositeKey = `${group.specId}-${story.id}`;
                            const removeTaskKey = `${group.specId}:${story.id}`;
                            const isRemovingTask = removingQueueTaskKeys.has(removeTaskKey);
                            const canRemoveTask = status !== 'running' && Boolean(onRemoveTaskFromQueue);
                            
                            return (
                              <div
                                key={compositeKey}
                                data-story-id={story.id}
                                onClick={() => setSelectedStoryId(story.id)}
                                className={`
                                  group/task px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors border
                                  ${isSelected 
                                    ? 'bg-primary/15 border-primary/30 text-primary-foreground' 
                                    : 'hover:bg-white/5 border-transparent text-muted-foreground hover:text-foreground'}
                                `}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                                    isSelected ? 'bg-primary/20 text-primary' : 'bg-black/20'
                                  }`}>
                                    {story.id}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {status === 'running' && (
                                      <>
                                        <span className="text-[9px] text-primary font-bold animate-pulse">RUNNING</span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                      </>
                                    )}
                                    {status === 'completed' && (
                                      <span className="text-success text-[10px]">✓</span>
                                    )}
                                    {canRemoveTask && (
                                      <button
                                        type="button"
                                        aria-label={`Remove ${story.id} from queue`}
                                        className={`
                                          h-5 w-5 inline-flex items-center justify-center rounded transition
                                          ${isRemovingTask
                                            ? 'text-muted-foreground cursor-wait'
                                            : 'text-muted-foreground/60 hover:text-error hover:bg-error/10'}
                                          ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/task:opacity-100'}
                                        `}
                                        disabled={isRemovingTask}
                                        onClick={async (event) => {
                                          event.stopPropagation();
                                          const targetSpecId = queueSpecByTaskId.get(story.id) || group.specId;
                                          if (!targetSpecId || !onRemoveTaskFromQueue || isRemovingTask) return;
                                          await onRemoveTaskFromQueue(targetSpecId, story.id);
                                        }}
                                      >
                                        {isRemovingTask ? (
                                          <Loader2Icon className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <XIcon className="w-3 h-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="truncate text-[11px] opacity-80">{story.title}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Logs / Details */}
            <div className="flex-1 flex flex-col min-w-0 bg-background">
              {selectedStoryId ? (
                <>
                  <div className="px-4 py-3 border-b border-border/30 bg-secondary/5 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
                        {selectedStoryId}
                      </span>
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {selectedStoryTitle}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {getTaskStatus(selectedStoryId) === 'running' && (
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                          Live
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-hidden relative">
                    {(selectedStoryId === currentStoryId || !currentStoryId) ? (
                      <ChatLogView
                        entries={logEntries}
                        isRunning={isRunning && selectedStoryId === currentStoryId}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
                        <p>Logs are currently only available for the active task.</p>
                        <p className="text-xs mt-2 opacity-60">
                          (Task {selectedStoryId} is {getTaskStatus(selectedStoryId)})
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p>Select a task to view details</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full min-h-0 border border-border/30 rounded-lg bg-card/30 overflow-y-auto p-5">
            <section className="rounded-xl bg-muted border border-border p-5">
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span>📖</span>
                  Lessons Learned ({lessonsLearned.length})
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Accumulated knowledge from completed tasks. This knowledge persists across all iterations.
              </p>

              {categoriesWithLessons.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    variant={selectedLessonCategory === 'all' ? 'primary' : 'ghost'}
                    size="sm"
                    className="h-8"
                    onClick={() => setSelectedLessonCategory('all')}
                  >
                    All ({lessonsLearned.length})
                  </Button>
                  {categoriesWithLessons.map((category) => {
                    const count = lessonsLearned.filter((lesson) => lesson.category === category).length;
                    return (
                      <Button
                        key={category}
                        variant={selectedLessonCategory === category ? 'primary' : 'ghost'}
                        size="sm"
                        className="h-8"
                        onClick={() => setSelectedLessonCategory(category)}
                      >
                        {categoryLabels[category]} ({count})
                      </Button>
                    );
                  })}
                </div>
              )}

              {filteredLessons.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {filteredLessons.map((lesson, index) => (
                    <div key={`${lesson.addedAt}-${index}`} className="rounded-lg bg-card border border-border p-3">
                      <Badge variant={categoryVariants[lesson.category]} size="sm" className="w-fit mb-2">
                        {categoryLabels[lesson.category]}
                      </Badge>
                      <div className="text-sm">{lesson.lesson}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                        <span>Added by {lesson.addedBy}</span>
                        <span>{formatLessonDate(lesson.addedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No lessons learned yet. Complete tasks to accumulate knowledge.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
}
