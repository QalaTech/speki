import { useState, useMemo, useEffect, useRef } from 'react';
import type { UserStory } from '../types';
import type { ParsedEntry } from '../utils/parseJsonl';
import { ChatLogView } from '../components/chat/ChatLogView';
import { TaskInfoPanel } from '../components/shared/TaskInfoPanel';

interface LiveExecutionViewProps {
  stories: UserStory[];
  currentStory: string | null;
  logEntries: ParsedEntry[];
  currentIteration: number | null;
  maxIterations: number;
  isRunning: boolean;
}

type TabType = 'chat' | 'info';

// SVG Icons for tabs
const TabIcons = {
  chat: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  check: (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
};

export function LiveExecutionView({
  stories,
  currentStory,
  logEntries,
  currentIteration,
  maxIterations,
  isRunning,
}: LiveExecutionViewProps) {
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const listRef = useRef<HTMLDivElement>(null);

  const chatEntries = logEntries;
  const runningStoryId = currentStory?.split(':')[0]?.trim() || null;

  // Order stories: done (top), running, ready, blocked
  const { orderedStories, firstActiveIndex } = useMemo(() => {
    const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

    const getOrder = (story: UserStory): number => {
      if (story.passes) return 0;
      if (runningStoryId === story.id) return 1;
      const depsOk = story.dependencies.every(dep => completedIds.has(dep));
      return depsOk ? 2 : 3;
    };

    const originalIndex = new Map(stories.map((s, i) => [s.id, i]));

    const sorted = [...stories].sort((a, b) => {
      const orderDiff = getOrder(a) - getOrder(b);
      if (orderDiff !== 0) return orderDiff;
      return (originalIndex.get(a.id) ?? 999) - (originalIndex.get(b.id) ?? 999);
    });

    const activeIdx = sorted.findIndex(s => !s.passes);
    return { orderedStories: sorted, firstActiveIndex: activeIdx >= 0 ? activeIdx : 0 };
  }, [stories, runningStoryId]);

  // Scroll to current task on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (listRef.current) {
        const list = listRef.current;
        const items = list.querySelectorAll('[data-task-item]');
        if (items[firstActiveIndex]) {
          const task = items[firstActiveIndex] as HTMLElement;
          const listTop = list.getBoundingClientRect().top;
          const taskTop = task.getBoundingClientRect().top;
          list.scrollTop = list.scrollTop + (taskTop - listTop) - 16;
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [firstActiveIndex]);

  const selectedStory = useMemo(() => {
    const id = selectedStoryId || runningStoryId;
    return stories.find(s => s.id === id) || null;
  }, [selectedStoryId, runningStoryId, stories]);

  const getStoryStatus = (story: UserStory): 'running' | 'ready' | 'blocked' | 'done' => {
    if (runningStoryId === story.id) return 'running';
    if (story.passes) return 'done';
    const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));
    const depsOk = story.dependencies.every(dep => completedIds.has(dep));
    return depsOk ? 'ready' : 'blocked';
  };

  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));

  const statusConfig: Record<string, { color: string; bg: string; dot: string }> = {
    running: { color: 'text-primary', bg: 'bg-primary/10', dot: 'bg-primary' },
    ready: { color: 'text-info', bg: 'bg-info/10', dot: 'bg-info' },
    blocked: { color: 'text-error', bg: 'bg-error/10', dot: 'bg-error' },
    done: { color: 'text-success', bg: 'bg-success/10', dot: 'bg-success' },
  };

  return (
    <div className="flex flex-1 h-full bg-background overflow-hidden">
      {/* Left Panel - Task Queue */}
      <div className="w-80 min-w-[280px] max-w-[360px] h-full bg-background border-r border-border flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-secondary/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <h3 className="text-sm font-semibold text-foreground">Task Queue</h3>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{stories.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3" ref={listRef}>
          {orderedStories.map((story, index) => {
            const status = getStoryStatus(story);
            const config = statusConfig[status];
            const isSelected = selectedStory?.id === story.id;
            const isRunningTask = status === 'running';
            const isNext = !isRunning && status === 'ready' &&
              orderedStories.findIndex(s => getStoryStatus(s) === 'ready') === index;

            return (
              <div
                key={story.id}
                data-task-item
                className={`
                  relative rounded-xl p-3 mb-2 cursor-pointer transition-all duration-200
                  border-2 ${isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-muted'}
                  ${isRunningTask ? 'bg-primary/5 ring-2 ring-primary/20' : 'bg-secondary hover:bg-secondary/80'}
                  ${status === 'done' ? 'opacity-50 hover:opacity-80' : ''}
                `}
                onClick={() => setSelectedStoryId(story.id)}
              >
                {/* Status indicator stripe */}
                <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${config.dot}`} />

                <div className="pl-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    {status === 'done' ? (
                      <span className="w-5 h-5 flex items-center justify-center text-success bg-success/20 rounded-full">
                        {TabIcons.check}
                      </span>
                    ) : (
                      <span className={`w-2 h-2 rounded-full ${config.dot} ${isRunningTask ? 'animate-pulse' : ''}`} />
                    )}
                    <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{story.id}</span>
                    {isNext && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-info/20 text-info font-semibold">NEXT</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${
                      story.priority === 1 ? 'bg-error/10 text-error' :
                      story.priority === 2 ? 'bg-warning/10 text-warning' :
                      'bg-muted text-muted-foreground'
                    }`}>P{story.priority}</span>
                  </div>
                  <div className={`text-sm leading-snug line-clamp-2 ${status === 'done' ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {story.title}
                  </div>
                  {isRunningTask && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-primary">
                      <span className="loading-dots h-1 w-4" />
                      <span>Running...</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel - Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {selectedStory ? (
          <>
            {/* Content Header */}
            <div className="px-6 py-5 bg-main/50 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig[getStoryStatus(selectedStory)].bg} ${statusConfig[getStoryStatus(selectedStory)].color}`}>
                    <span className={`w-2 h-2 rounded-full ${statusConfig[getStoryStatus(selectedStory)].dot}`} />
                    {getStoryStatus(selectedStory).toUpperCase()}
                  </span>
                  {selectedStory.complexity && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      selectedStory.complexity === 'high' ? 'bg-error/10 text-error' :
                      selectedStory.complexity === 'medium' ? 'bg-warning/10 text-warning' :
                      'bg-success/10 text-success'
                    }`}>
                      {selectedStory.complexity}
                    </span>
                  )}
                </div>
                {isRunning && runningStoryId === selectedStory.id && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    Iteration {currentIteration || 1}/{maxIterations}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{selectedStory.id}</span>
                <span className="text-border">·</span>
                <h2 className="text-lg font-semibold text-foreground">{selectedStory.title}</h2>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border bg-background px-6">
              <button
                onClick={() => setActiveTab('chat')}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                  activeTab === 'chat' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {TabIcons.chat}
                Live Log
                {isRunning && runningStoryId === selectedStory.id && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/20 text-error text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                    LIVE
                  </span>
                )}
                {activeTab === 'chat' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
              </button>
              <button
                onClick={() => setActiveTab('info')}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                  activeTab === 'info' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {TabIcons.info}
                Task Info
                {activeTab === 'info' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab === 'chat' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {isRunning && runningStoryId === selectedStory.id ? (
                    <ChatLogView entries={chatEntries} isRunning={isRunning} />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        {getStoryStatus(selectedStory) === 'done' ? (
                          <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="w-8 h-8 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getStoryStatus(selectedStory) === 'done'
                          ? 'This task has been completed.'
                          : 'Start a run to see live execution logs.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'info' && (
                <div className="flex-1 overflow-y-auto p-6">
                  <TaskInfoPanel story={selectedStory} completedIds={completedIds} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Task Selected</h3>
            <p className="text-sm text-muted-foreground">Select a task from the queue to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
