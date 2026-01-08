import type { UserStory } from '../types';
import { getStoryStatus } from '../types';

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

  const handleDepClick = (e: React.MouseEvent, depId: string) => {
    e.stopPropagation();
    onNavigate(depId);
  };

  return (
    <div
      id={`task-${story.id}`}
      className={`task-card ${status} ${isRunning ? 'running' : ''} ${highlighted ? 'highlighted' : ''}`}
      onClick={onToggle}
    >
      <div className="task-header">
        <div className="task-status-icon">
          {isRunning && <span className="pulse-dot" />}
          {!isRunning && status === 'completed' && '✓'}
          {!isRunning && status === 'ready' && '▶'}
          {!isRunning && status === 'blocked' && '⏸'}
        </div>
        <div className="task-title-section">
          <span className="task-id">{story.id}</span>
          <span className="task-title">{story.title}</span>
          {isRunning && <span className="running-indicator">IN PROGRESS</span>}
        </div>
        <div className="task-meta">
          {/* Dependency indicators in header */}
          {story.dependencies.length > 0 && (
            <span className={`dep-indicator ${missingDeps.length > 0 ? 'has-missing' : 'all-satisfied'}`}>
              <span className="dep-icon">↑</span>
              <span className="dep-count">{satisfiedDeps.length}/{story.dependencies.length}</span>
            </span>
          )}
          {blocks.length > 0 && (
            <span className="blocks-indicator">
              <span className="blocks-icon">↓</span>
              <span className="blocks-count">{blocks.length}</span>
            </span>
          )}
          <span className="task-priority">P{story.priority}</span>
          <span className={`task-status-badge ${isRunning ? 'running' : status}`}>
            {isRunning ? 'running' : status}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="task-details">
          <div className="task-section">
            <h4>Description</h4>
            <p>{story.description}</p>
          </div>

          {story.dependencies.length > 0 && (
            <div className="task-section">
              <h4>
                <span className="section-icon">↑</span> Depends On ({satisfiedDeps.length}/{story.dependencies.length})
              </h4>
              <div className="dependency-list">
                {story.dependencies.map(dep => (
                  <button
                    key={dep}
                    className={`dependency-tag clickable ${completedIds.has(dep) ? 'satisfied' : 'missing'}`}
                    onClick={(e) => handleDepClick(e, dep)}
                    title={`Go to ${dep}`}
                  >
                    {completedIds.has(dep) ? '✓' : '○'} {dep}
                  </button>
                ))}
              </div>
              {missingDeps.length > 0 && (
                <p className="missing-deps-warning">
                  Blocked by {missingDeps.length} incomplete {missingDeps.length === 1 ? 'task' : 'tasks'}
                </p>
              )}
            </div>
          )}

          {blocks.length > 0 && (
            <div className="task-section">
              <h4>
                <span className="section-icon">↓</span> Blocks ({blocks.length})
              </h4>
              <div className="dependency-list">
                {blocks.map(blockId => (
                  <button
                    key={blockId}
                    className={`dependency-tag clickable blocks-tag ${completedIds.has(blockId) ? 'satisfied' : 'pending'}`}
                    onClick={(e) => handleDepClick(e, blockId)}
                    title={`Go to ${blockId}`}
                  >
                    {blockId}
                  </button>
                ))}
              </div>
              {status !== 'completed' && (
                <p className="blocks-info">
                  Completing this will unblock {blocks.length} {blocks.length === 1 ? 'task' : 'tasks'}
                </p>
              )}
            </div>
          )}

          <div className="task-section">
            <h4>Acceptance Criteria</h4>
            <ul className="criteria-list">
              {story.acceptanceCriteria.map((criterion, idx) => (
                <li key={idx}>{criterion}</li>
              ))}
            </ul>
          </div>

          {story.testCases && story.testCases.length > 0 && (
            <div className="task-section">
              <h4>Test Cases</h4>
              <ul className="test-list">
                {story.testCases.map((test, idx) => (
                  <li key={idx}><code>{test}</code></li>
                ))}
              </ul>
            </div>
          )}

          {story.notes && (
            <div className="task-section">
              <h4>Notes</h4>
              <p className="task-notes">{story.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
