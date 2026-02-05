import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { ChatLogView } from '../../../components/chat/ChatLogView';
import type { ParsedEntry } from '../../../utils/parseJsonl';
import type { RalphStatus, UserStory, QueuedTaskReference } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { StopCircleIcon, PlayIcon, ChevronRightIcon } from 'lucide-react';
import { getSpecTypeIcon } from '@/components/specs/SpecTreeNode';

interface ExecutionLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  ralphStatus: RalphStatus;
  logEntries: ParsedEntry[];
  onStopExecution: () => void;
  onResumeExecution?: () => void;
  onNavigateToSpec?: (specId: string) => void;
  stories?: UserStory[];
  queueTasks?: QueuedTaskReference[];
  completedIds?: Set<string>;
}

export function ExecutionLiveModal({
  isOpen,
  onClose,
  ralphStatus,
  logEntries,
  onStopExecution,
  onResumeExecution,
  onNavigateToSpec,
  stories = [],
  queueTasks = [],
  completedIds = new Set(),
}: ExecutionLiveModalProps) {
  const isRunning = ralphStatus.running;
  const currentStoryId = ralphStatus.currentStory?.split(':')[0]?.trim();
  
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-select running task
  useEffect(() => {
    if (currentStoryId) {
      setSelectedStoryId(currentStoryId);
    }
  }, [currentStoryId]);

  // Group stories by Spec
  const groupedStories = useMemo(() => {
    const queuedTaskIds = new Set(queueTasks.map(t => t.taskId));
    
    // Ensure activeTasks are unique by ID and not completed
    const uniqueActiveTasksMap = new Map<string, UserStory>();
    stories
      .filter(s => (queuedTaskIds.has(s.id) || s.id === currentStoryId) && !completedIds.has(s.id))
      .forEach(s => uniqueActiveTasksMap.set(s.id, s));
    
    const activeTasks = Array.from(uniqueActiveTasksMap.values());
    
    const groups: Record<string, UserStory[]> = {};
    const taskToSpec = new Map<string, string>();
    queueTasks.forEach(t => taskToSpec.set(t.taskId, t.specId));

    activeTasks.forEach(story => {
      let specId = taskToSpec.get(story.id) || story.id.split('-')[0] || 'Unknown';
      if (!groups[specId]) groups[specId] = [];
      groups[specId].push(story);
    });

    const sortedGroups = Object.entries(groups).map(([specId, stories]) => ({
      specId,
      stories: stories.sort((a, b) => {
        const getOrder = (id: string) => {
          if (id === currentStoryId) return 0;
          if (completedIds.has(id)) return 1;
          return 2;
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
  }, [stories, queueTasks, currentStoryId, completedIds]);

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
    if (completedIds.has(id)) return 'completed';
    return 'pending';
  };

  const selectedStoryTitle = stories.find(s => s.id === selectedStoryId)?.title || selectedStoryId;

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
      <div className="flex h-full min-h-0 border border-border/30 rounded-lg overflow-hidden bg-card/30 animate-stagger-in">
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
                        
                        return (
                          <div
                            key={compositeKey}
                            data-story-id={story.id}
                            onClick={() => setSelectedStoryId(story.id)}
                            className={`
                              px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors border
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
                              {status === 'running' && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-primary font-bold animate-pulse">RUNNING</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                </div>
                              )}
                              {status === 'completed' && (
                                <span className="text-success text-[10px]">✓</span>
                              )}
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
                {getTaskStatus(selectedStoryId) === 'running' && (
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                    Live
                  </span>
                )}
              </div>
              
              <div className="flex-1 overflow-hidden relative">
                {/* Only show logs for the running task or if we have logs and selected matches running */}
                {/* Note: Currently logs are global for the run, so filtering by task ID in logs isn't fully supported by backend yet.
                    For now, we show the live log stream if it's the running task, or a placeholder for others. 
                    Ideally, we'd persist logs per task. */}
                {(selectedStoryId === currentStoryId || !currentStoryId) ? (
                  <ChatLogView entries={logEntries} isRunning={isRunning && selectedStoryId === currentStoryId} />
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
    </Modal>
  );
}
