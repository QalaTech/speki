import { useState, useMemo, useEffect, useRef } from 'react';
import type { UserStory } from '../types';
import type { ParsedEntry } from '../utils/parseJsonl';
import { ChatLogView } from './ChatLogView';
import { ContextSection } from './ContextSection';

interface LiveExecutionViewProps {
  stories: UserStory[];
  currentStory: string | null;
  /** @deprecated Use logEntries instead */
  iterationLog: string;
  /** Structured log entries from SSE events */
  logEntries: ParsedEntry[];
  currentIteration: number | null;
  maxIterations: number;
  isRunning: boolean;
}

type TabType = 'chat' | 'info' | 'coming-soon';

export function LiveExecutionView({
  stories,
  currentStory,
  iterationLog,
  logEntries,
  currentIteration,
  maxIterations,
  isRunning,
}: LiveExecutionViewProps) {
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const listRef = useRef<HTMLDivElement>(null);

  // Use logEntries directly from SSE (no parsing needed)
  const chatEntries = logEntries;

  // Get the currently running story ID
  const runningStoryId = currentStory?.split(':')[0]?.trim() || null;

  // Debug: trace render condition values
  console.log('[LiveExec] Render check:', {
    isRunning,
    currentStory,
    runningStoryId,
    selectedStoryId,
    storyIds: stories.map(s => s.id),
    iterationLogLength: iterationLog?.length || 0,
  });

  // Order stories: done (top), running, ready, blocked - preserving queue order within each group
  const { orderedStories, firstActiveIndex } = useMemo(() => {
    const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

    const getOrder = (story: UserStory): number => {
      if (story.passes) return 0; // Done - top (scroll up to see history)
      if (runningStoryId === story.id) return 1; // Running - middle (visible)
      const depsOk = story.dependencies.every(dep => completedIds.has(dep));
      return depsOk ? 2 : 3; // Ready = 2, Blocked = 3
    };

    // Create index map to preserve original queue order
    const originalIndex = new Map(stories.map((s, i) => [s.id, i]));

    const sorted = [...stories].sort((a, b) => {
      const orderDiff = getOrder(a) - getOrder(b);
      if (orderDiff !== 0) return orderDiff;
      // Preserve queue order within same status group (not priority)
      return (originalIndex.get(a.id) ?? 999) - (originalIndex.get(b.id) ?? 999);
    });

    // Find index of first non-done task
    const activeIdx = sorted.findIndex(s => !s.passes);

    return { orderedStories: sorted, firstActiveIndex: activeIdx >= 0 ? activeIdx : 0 };
  }, [stories, runningStoryId]);

  // On mount, scroll to current/next task at TOP of the list viewport
  useEffect(() => {
    const timer = setTimeout(() => {
      if (listRef.current) {
        const list = listRef.current;
        const items = list.querySelectorAll('[data-task-item]');
        if (items[firstActiveIndex]) {
          const task = items[firstActiveIndex] as HTMLElement;
          const listTop = list.getBoundingClientRect().top;
          const taskTop = task.getBoundingClientRect().top;
          const buffer = 16;
          list.scrollTop = list.scrollTop + (taskTop - listTop) - buffer;
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [firstActiveIndex]);

  // Get the selected story (or the running one by default)
  const selectedStory = useMemo(() => {
    const id = selectedStoryId || runningStoryId;
    return stories.find(s => s.id === id) || null;
  }, [selectedStoryId, runningStoryId, stories]);

  // Get story status
  const getStoryStatus = (story: UserStory): 'running' | 'ready' | 'blocked' | 'done' => {
    if (runningStoryId === story.id) return 'running';
    if (story.passes) return 'done';
    const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));
    const depsOk = story.dependencies.every(dep => completedIds.has(dep));
    return depsOk ? 'ready' : 'blocked';
  };

  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

  const getStatusStyles = (status: string, isSelected: boolean, isGlow: boolean) => {
    const baseClasses = "bg-surface border rounded-lg p-3 mb-2 cursor-pointer transition-all duration-150";
    const borderLeftColors: Record<string, string> = {
      running: "border-l-[3px] border-l-running",
      ready: "border-l-[3px] border-l-ready",
      blocked: "border-l-[3px] border-l-blocked",
      done: "border-l-[3px] border-l-completed opacity-50 bg-bg hover:opacity-80",
    };
    const selectedStyles = isSelected ? "border-accent bg-accent/8" : "border-border hover:border-accent hover:shadow-lg";
    const glowStyles = isGlow ? "border-running bg-running/10 shadow-[0_0_10px_rgba(163,113,247,0.3),0_0_20px_rgba(163,113,247,0.2),0_0_30px_rgba(163,113,247,0.1)] animate-pulse" : "";

    return `${baseClasses} ${borderLeftColors[status] || ''} ${selectedStyles} ${glowStyles}`;
  };

  const getStatusBadgeStyles = (status: string) => {
    const base = "text-[10px] font-semibold px-2.5 py-1 rounded uppercase tracking-wide";
    const colors: Record<string, string> = {
      running: "bg-running/15 text-running",
      ready: "bg-ready/15 text-ready",
      blocked: "bg-blocked/15 text-blocked",
      done: "bg-completed/15 text-completed",
    };
    return `${base} ${colors[status] || ''}`;
  };

  const getComplexityBadgeStyles = (complexity: string) => {
    const base = "text-[10px] font-semibold px-2.5 py-1 rounded uppercase tracking-wide";
    const colors: Record<string, string> = {
      low: "bg-completed/15 text-completed",
      medium: "bg-warning/15 text-warning",
      high: "bg-blocked/15 text-blocked",
    };
    return `${base} ${colors[complexity] || ''}`;
  };

  return (
    <div className="flex flex-1 h-full gap-0 bg-surface overflow-hidden">
      {/* Left Panel - Task Queue */}
      <div className="w-80 min-w-[280px] max-w-[400px] h-full bg-bg border-r border-border flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface">
          <h3 className="m-0 text-sm font-semibold text-text uppercase tracking-wide">Task Queue</h3>
          <span className="text-xs text-text-muted bg-bg px-2.5 py-1 rounded-xl">{stories.length} tasks</span>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 min-h-0" ref={listRef}>
          {orderedStories.map((story, index) => {
            const status = getStoryStatus(story);
            const isSelected = selectedStory?.id === story.id;
            const isRunningTask = status === 'running';
            const isNext = !isRunning && status === 'ready' &&
              orderedStories.findIndex(s => getStoryStatus(s) === 'ready') === index;

            return (
              <div
                key={story.id}
                data-task-item
                className={getStatusStyles(status, isSelected, isRunningTask)}
                onClick={() => setSelectedStoryId(story.id)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {status === 'done' ? (
                    <span className="w-4 h-4 flex items-center justify-center text-xs font-bold text-completed bg-completed/20 rounded-full shrink-0">✓</span>
                  ) : (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      status === 'running' ? 'bg-running animate-pulse' :
                      status === 'ready' ? 'bg-ready' :
                      status === 'blocked' ? 'bg-blocked' : 'bg-completed'
                    }`} />
                  )}
                  <span className="text-xs font-semibold text-text">{story.id}</span>
                  {isNext && (
                    <span className="text-[9px] font-bold bg-ready text-black px-1.5 py-0.5 rounded uppercase tracking-wide">NEXT</span>
                  )}
                  <span className="text-[10px] text-text-muted bg-bg px-1.5 py-0.5 rounded ml-auto">P{story.priority}</span>
                </div>
                <div className={`text-[13px] leading-snug line-clamp-2 ${status === 'done' ? 'text-text-muted' : 'text-text'}`}>
                  {story.title}
                </div>
                {isRunningTask && (
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-running">
                    <span className="w-1.5 h-1.5 bg-running rounded-full animate-pulse" />
                    <span>Running...</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel - Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-bg">
        {selectedStory ? (
          <>
            {/* Content Header */}
            <div className="px-6 py-5 bg-surface border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={getStatusBadgeStyles(getStoryStatus(selectedStory))}>
                  {getStoryStatus(selectedStory).toUpperCase()}
                </span>
                {selectedStory.complexity && (
                  <span className={getComplexityBadgeStyles(selectedStory.complexity)}>
                    {selectedStory.complexity}
                  </span>
                )}
                <h2 className="m-0 text-lg font-semibold text-text">{selectedStory.id}: {selectedStory.title}</h2>
              </div>
              {isRunning && runningStoryId === selectedStory.id && (
                <div className="text-xs text-text-muted bg-bg px-3 py-1.5 rounded-md">
                  Iteration {currentIteration || 1}/{maxIterations}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-0 px-6 bg-surface border-b border-border">
              <button
                className={`flex items-center gap-2 px-4 py-3 bg-transparent border-none border-b-2 text-[13px] font-medium cursor-pointer transition-all duration-150 ${
                  activeTab === 'chat'
                    ? 'text-accent border-b-accent'
                    : 'text-text-muted border-transparent hover:text-text hover:bg-bg'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                <span className="text-sm">💬</span>
                Live Log
                {isRunning && runningStoryId === selectedStory.id && (
                  <span className="text-[9px] font-bold bg-running text-black px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
                )}
              </button>
              <button
                className={`flex items-center gap-2 px-4 py-3 bg-transparent border-none border-b-2 text-[13px] font-medium cursor-pointer transition-all duration-150 ${
                  activeTab === 'info'
                    ? 'text-accent border-b-accent'
                    : 'text-text-muted border-transparent hover:text-text hover:bg-bg'
                }`}
                onClick={() => setActiveTab('info')}
              >
                <span className="text-sm">📋</span>
                Task Info
              </button>
              <button
                className={`flex items-center gap-2 px-4 py-3 bg-transparent border-none border-b-2 text-[13px] font-medium cursor-pointer transition-all duration-150 ${
                  activeTab === 'coming-soon'
                    ? 'text-accent border-b-accent'
                    : 'text-text-muted border-transparent hover:text-text hover:bg-bg'
                }`}
                onClick={() => setActiveTab('coming-soon')}
              >
                <span className="text-sm">🚀</span>
                Coming Soon
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab === 'chat' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {isRunning && runningStoryId === selectedStory.id ? (
                    <ChatLogView entries={chatEntries} isRunning={isRunning} />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-center p-10">
                      <div className="text-5xl mb-4 opacity-50">💬</div>
                      <p className="m-0 text-sm">
                        {getStoryStatus(selectedStory) === 'done'
                          ? 'This task has been completed.'
                          : 'Start Ralph to see live execution logs.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'info' && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="mb-6">
                    <h4 className="m-0 mb-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Description</h4>
                    <p className="m-0 text-sm text-text leading-relaxed">{selectedStory.description}</p>
                  </div>

                  <div className="mb-6">
                    <h4 className="m-0 mb-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Acceptance Criteria</h4>
                    <ul className="list-none p-0 m-0">
                      {selectedStory.acceptanceCriteria.map((criterion, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 py-2 text-[13px] text-text border-b border-border last:border-b-0">
                          <span className="w-[18px] h-[18px] flex items-center justify-center text-xs text-completed shrink-0">
                            {selectedStory.passes ? '✓' : '○'}
                          </span>
                          {criterion}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {selectedStory.testCases && selectedStory.testCases.length > 0 && (
                    <div className="mb-6">
                      <h4 className="m-0 mb-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Test Cases</h4>
                      <ul className="list-none p-0 m-0">
                        {selectedStory.testCases.map((test, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 py-2 text-[13px] text-text border-b border-border last:border-b-0">
                            {test}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedStory.dependencies.length > 0 && (
                    <div className="mb-6">
                      <h4 className="m-0 mb-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Dependencies</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedStory.dependencies.map(dep => (
                          <span
                            key={dep}
                            className={`text-xs px-2.5 py-1 rounded border ${
                              completedIds.has(dep)
                                ? 'bg-completed/15 text-completed border-completed'
                                : 'bg-running/15 text-running border-running'
                            }`}
                          >
                            {dep}
                            {completedIds.has(dep) ? ' ✓' : ' ⏳'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedStory.notes && (
                    <div className="mb-6">
                      <h4 className="m-0 mb-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Notes</h4>
                      <p className="m-0 text-sm text-text leading-relaxed bg-surface p-3 px-4 rounded-md border border-border italic">
                        {selectedStory.notes}
                      </p>
                    </div>
                  )}

                  {selectedStory.context && (
                    <div className="mb-6">
                      <h4 className="m-0 mb-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Context</h4>
                      <ContextSection context={selectedStory.context} headingLevel="h5" />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'coming-soon' && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center p-10">
                    <span className="text-5xl block mb-4">🚀</span>
                    <h3 className="m-0 mb-2 text-xl text-text">Coming Soon</h3>
                    <p className="m-0 mb-6 text-sm text-text-muted">New features are on the way!</p>
                    <ul className="list-none p-0 m-0 text-left">
                      {['Task history & diff viewer', 'Code changes preview', 'Test results visualization', 'Performance metrics'].map((item, idx) => (
                        <li key={idx} className="py-2 text-[13px] text-text flex items-center gap-2">
                          <span className="text-accent">{'>'}</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-center p-10">
            <div className="text-6xl mb-4 opacity-50">📋</div>
            <h3 className="m-0 mb-2 text-lg text-text">No Task Selected</h3>
            <p className="m-0 text-sm">Select a task from the queue to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
