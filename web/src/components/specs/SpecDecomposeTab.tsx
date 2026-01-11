import { useState, useEffect, useCallback } from 'react';
import type { UserStory, PRDData, DecomposeState } from '../../types';
import './SpecDecomposeTab.css';

interface SpecDecomposeTabProps {
  specPath: string;
  projectPath: string;
}

type TaskStatus = 'completed' | 'ready' | 'blocked' | 'in-progress';

function getTaskStatus(story: UserStory, completedIds: Set<string>): TaskStatus {
  if (story.passes) return 'completed';

  const depsOk = story.dependencies.every(dep => completedIds.has(dep));
  return depsOk ? 'ready' : 'blocked';
}

function getStatusIcon(status: TaskStatus): string {
  switch (status) {
    case 'completed': return '✓';
    case 'ready': return '○';
    case 'blocked': return '⏸';
    case 'in-progress': return '▶';
    default: return '○';
  }
}

function getComplexityBadge(complexity?: string) {
  if (!complexity) return null;
  const colors: Record<string, string> = {
    low: 'task-complexity--low',
    medium: 'task-complexity--medium',
    high: 'task-complexity--high',
  };
  return (
    <span className={`task-complexity ${colors[complexity] || ''}`}>
      {complexity}
    </span>
  );
}

export function SpecDecomposeTab({ specPath, projectPath }: SpecDecomposeTabProps) {
  const [decomposeState, setDecomposeState] = useState<DecomposeState>({ status: 'IDLE', message: '' });
  const [draft, setDraft] = useState<PRDData | null>(null);
  const [branch, setBranch] = useState('ralph/feature');
  const [, setIsDecomposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Fetch decompose state and draft
  const fetchState = useCallback(async () => {
    try {
      const [stateRes, draftRes] = await Promise.all([
        fetch(apiUrl('/api/decompose/state')),
        fetch(apiUrl('/api/decompose/draft')),
      ]);

      const stateData = await stateRes.json();
      const draftData = await draftRes.json();

      setDecomposeState(stateData);
      setDraft(draftData.draft);

      if (draftData.draft?.branchName) {
        setBranch(draftData.draft.branchName);
      }

      // Check if decompose is in progress
      const isActive = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'].includes(stateData.status);
      setIsDecomposing(isActive);

      if (stateData.status === 'ERROR') {
        setError(stateData.error || 'Decomposition failed');
      } else {
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch decompose state:', err);
    }
  }, [apiUrl]);

  // Initial fetch and polling
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const isActive = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'].includes(decomposeState.status);
    const interval = setInterval(fetchState, isActive ? 3000 : 15000);
    return () => clearInterval(interval);
  }, [fetchState, decomposeState.status]);

  // Handle decompose
  const handleDecompose = async (force: boolean = false) => {
    setIsDecomposing(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/decompose/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prdFile: specPath,
          branchName: branch,
          forceRedecompose: force,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start decomposition');
      }

      // Fetch updated state
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start decomposition');
      setIsDecomposing(false);
    }
  };

  // Calculate stats
  const stories = draft?.userStories || [];
  const completedIds = new Set(stories.filter(s => s.passes).map(s => s.id));
  const stats = {
    total: stories.length,
    completed: completedIds.size,
    ready: stories.filter(s => !s.passes && s.dependencies.every(d => completedIds.has(d))).length,
    blocked: stories.filter(s => !s.passes && !s.dependencies.every(d => completedIds.has(d))).length,
  };

  // Check if this spec has been decomposed
  const hasBeenDecomposed = stories.length > 0;
  const isInProgress = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'].includes(decomposeState.status);

  return (
    <div className="spec-decompose-tab">
      {/* Header with actions */}
      <div className="decompose-header">
        <div className="decompose-info">
          <h3 className="decompose-title">
            {hasBeenDecomposed ? 'Task Breakdown' : 'Decompose Spec'}
          </h3>
          {hasBeenDecomposed && (
            <div className="decompose-stats">
              <span className="stat stat--completed">{stats.completed} done</span>
              <span className="stat stat--ready">{stats.ready} ready</span>
              <span className="stat stat--blocked">{stats.blocked} blocked</span>
            </div>
          )}
        </div>

        <div className="decompose-actions">
          {hasBeenDecomposed ? (
            <button
              className="decompose-btn decompose-btn--secondary"
              onClick={() => handleDecompose(true)}
              disabled={isInProgress}
            >
              {isInProgress ? '⏳ Running...' : '🔄 Re-decompose'}
            </button>
          ) : (
            <button
              className="decompose-btn decompose-btn--primary"
              onClick={() => handleDecompose(false)}
              disabled={isInProgress}
            >
              {isInProgress ? '⏳ Running...' : '🚀 Decompose'}
            </button>
          )}
        </div>
      </div>

      {/* Branch input */}
      <div className="decompose-branch">
        <label className="branch-label">Branch:</label>
        <input
          type="text"
          className="branch-input"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="ralph/feature"
          disabled={isInProgress}
        />
      </div>

      {/* Progress indicator */}
      {isInProgress && (
        <div className="decompose-progress">
          <div className="progress-spinner" />
          <span className="progress-message">{decomposeState.message || 'Processing...'}</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="decompose-error">
          <span className="error-icon">⚠</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      {/* Task list */}
      {hasBeenDecomposed && !isInProgress && (
        <div className="task-list">
          {stories.map((story) => {
            const status = getTaskStatus(story, completedIds);
            const isExpanded = expandedTask === story.id;

            return (
              <div
                key={story.id}
                className={`task-card task-card--${status}`}
                onClick={() => setExpandedTask(isExpanded ? null : story.id)}
              >
                <div className="task-header">
                  <span className={`task-status task-status--${status}`}>
                    {getStatusIcon(status)}
                  </span>
                  <span className="task-id">{story.id}</span>
                  <span className="task-title">{story.title}</span>
                  {getComplexityBadge(story.complexity)}
                  <span className="task-chevron">{isExpanded ? '▼' : '▶'}</span>
                </div>

                {isExpanded && (
                  <div className="task-details">
                    <p className="task-description">{story.description}</p>

                    {story.acceptanceCriteria.length > 0 && (
                      <div className="task-section">
                        <h4 className="task-section-title">Acceptance Criteria</h4>
                        <ul className="task-criteria">
                          {story.acceptanceCriteria.map((ac, i) => (
                            <li key={i}>{ac}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {story.dependencies.length > 0 && (
                      <div className="task-section">
                        <h4 className="task-section-title">Dependencies</h4>
                        <div className="task-deps">
                          {story.dependencies.map((dep) => (
                            <span
                              key={dep}
                              className={`task-dep ${completedIds.has(dep) ? 'task-dep--done' : ''}`}
                            >
                              {dep}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {story.notes && (
                      <div className="task-section">
                        <h4 className="task-section-title">Notes</h4>
                        <p className="task-notes">{story.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasBeenDecomposed && !isInProgress && (
        <div className="decompose-empty">
          <div className="empty-icon">📋</div>
          <h3 className="empty-title">No tasks yet</h3>
          <p className="empty-description">
            Decompose this spec to generate user stories and tasks
          </p>
        </div>
      )}
    </div>
  );
}
