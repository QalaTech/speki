import { useState, useMemo, useEffect, useRef } from 'react';
import type { UserStory } from '../types';
import type { ParsedEntry } from '../utils/parseJsonl';
import { ChatLogView } from './ChatLogView';
import { ContextSection } from './ContextSection';
import './LiveExecutionView.css';

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
        const items = list.querySelectorAll('.task-queue-item');
        if (items[firstActiveIndex]) {
          const task = items[firstActiveIndex] as HTMLElement;
          // Scroll so task is near top with buffer - account for list's own offset
          const listTop = list.getBoundingClientRect().top;
          const taskTop = task.getBoundingClientRect().top;
          const buffer = 16; // Extra space at top for visual breathing room
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

  return (
    <div className="live-execution">
      {/* Left: Task Queue */}
      <div className="task-queue">
        <div className="task-queue-header">
          <h3>Task Queue</h3>
          <span className="task-count">{stories.length} tasks</span>
        </div>
        <div className="task-queue-list" ref={listRef}>
          {orderedStories.map((story, index) => {
            const status = getStoryStatus(story);
            const isSelected = selectedStory?.id === story.id;
            const isRunningTask = status === 'running';
            // Show "NEXT" tag on first ready task when nothing is running
            const isNext = !isRunning && status === 'ready' &&
              orderedStories.findIndex(s => getStoryStatus(s) === 'ready') === index;

            return (
              <div
                key={story.id}
                className={`task-queue-item ${status} ${isSelected ? 'selected' : ''} ${isRunningTask ? 'glow' : ''}`}
                onClick={() => setSelectedStoryId(story.id)}
              >
                <div className="task-queue-item-header">
                  {status === 'done' ? (
                    <span className="task-status-tick">✓</span>
                  ) : (
                    <span className={`task-status-dot ${status}`} />
                  )}
                  <span className="task-id">{story.id}</span>
                  {isNext && <span className="task-next-badge">NEXT</span>}
                  <span className="task-priority">P{story.priority}</span>
                </div>
                <div className="task-title">{story.title}</div>
                {isRunningTask && (
                  <div className="task-running-indicator">
                    <span className="pulse-dot" />
                    <span>Running...</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Main Content */}
      <div className="task-content">
        {selectedStory ? (
          <>
            {/* Content Header */}
            <div className="task-content-header">
              <div className="task-content-title">
                <span className={`task-status-badge ${getStoryStatus(selectedStory)}`}>
                  {getStoryStatus(selectedStory).toUpperCase()}
                </span>
                {selectedStory.complexity && (
                  <span className={`task-complexity-badge ${selectedStory.complexity}`}>
                    {selectedStory.complexity}
                  </span>
                )}
                <h2>{selectedStory.id}: {selectedStory.title}</h2>
              </div>
              {isRunning && runningStoryId === selectedStory.id && (
                <div className="iteration-badge">
                  Iteration {currentIteration || 1}/{maxIterations}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="task-tabs">
              <button
                className={`task-tab ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <span className="tab-icon">💬</span>
                Live Log
                {isRunning && runningStoryId === selectedStory.id && (
                  <span className="live-badge">LIVE</span>
                )}
              </button>
              <button
                className={`task-tab ${activeTab === 'info' ? 'active' : ''}`}
                onClick={() => setActiveTab('info')}
              >
                <span className="tab-icon">📋</span>
                Task Info
              </button>
              <button
                className={`task-tab ${activeTab === 'coming-soon' ? 'active' : ''}`}
                onClick={() => setActiveTab('coming-soon')}
              >
                <span className="tab-icon">🚀</span>
                Coming Soon
              </button>
            </div>

            {/* Tab Content */}
            <div className="task-tab-content">
              {activeTab === 'chat' && (
                <div className="chat-tab">
                  {isRunning && runningStoryId === selectedStory.id ? (
                    <ChatLogView entries={chatEntries} isRunning={isRunning} />
                  ) : (
                    <div className="chat-empty">
                      <div className="chat-empty-icon">💬</div>
                      <p>
                        {getStoryStatus(selectedStory) === 'done'
                          ? 'This task has been completed.'
                          : 'Start Ralph to see live execution logs.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'info' && (
                <div className="info-tab">
                  <div className="info-section">
                    <h4>Description</h4>
                    <p>{selectedStory.description}</p>
                  </div>

                  <div className="info-section">
                    <h4>Acceptance Criteria</h4>
                    <ul className="criteria-list">
                      {selectedStory.acceptanceCriteria.map((criterion, idx) => (
                        <li key={idx}>
                          <span className="criterion-check">
                            {selectedStory.passes ? '✓' : '○'}
                          </span>
                          {criterion}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {selectedStory.testCases && selectedStory.testCases.length > 0 && (
                    <div className="info-section">
                      <h4>Test Cases</h4>
                      <ul className="test-list">
                        {selectedStory.testCases.map((test, idx) => (
                          <li key={idx}>{test}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedStory.dependencies.length > 0 && (
                    <div className="info-section">
                      <h4>Dependencies</h4>
                      <div className="dependency-tags">
                        {selectedStory.dependencies.map(dep => (
                          <span
                            key={dep}
                            className={`dep-tag ${completedIds.has(dep) ? 'done' : 'pending'}`}
                          >
                            {dep}
                            {completedIds.has(dep) ? ' ✓' : ' ⏳'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedStory.notes && (
                    <div className="info-section">
                      <h4>Notes</h4>
                      <p className="notes-content">{selectedStory.notes}</p>
                    </div>
                  )}

                  {selectedStory.context && (
                    <div className="info-section">
                      <h4>Context</h4>
                      <ContextSection context={selectedStory.context} headingLevel="h5" />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'coming-soon' && (
                <div className="coming-soon-tab">
                  <div className="coming-soon-content">
                    <span className="coming-soon-icon">🚀</span>
                    <h3>Coming Soon</h3>
                    <p>New features are on the way!</p>
                    <ul className="coming-soon-list">
                      <li>Task history & diff viewer</li>
                      <li>Code changes preview</li>
                      <li>Test results visualization</li>
                      <li>Performance metrics</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="no-task-selected">
            <div className="no-task-icon">📋</div>
            <h3>No Task Selected</h3>
            <p>Select a task from the queue to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
