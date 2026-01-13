import { useState, useEffect, useCallback } from 'react';
import type { UserStory } from '../../types';
import { calculateStats } from '../../types';
import './SpecDashboard.css';

/** Spec status in the lifecycle */
type SpecStatus = 'draft' | 'reviewed' | 'decomposed' | 'active' | 'completed';

/** Spec metadata from the API */
interface SpecInfo {
  specId: string;
  created: string | null;
  lastModified: string | null;
  status: SpecStatus;
  specPath: string;
}

/** Tasks data for a spec */
interface SpecTasks {
  specId: string;
  tasks: UserStory[];
  projectName: string | null;
}

interface SpecDashboardProps {
  projectPath: string;
  onSpecSelect?: (specId: string) => void;
}

/** Status badge color mapping */
const STATUS_CONFIG: Record<SpecStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'spec-status--draft' },
  reviewed: { label: 'Reviewed', className: 'spec-status--reviewed' },
  decomposed: { label: 'Decomposed', className: 'spec-status--decomposed' },
  active: { label: 'Active', className: 'spec-status--active' },
  completed: { label: 'Completed', className: 'spec-status--completed' },
};

/** All status values in lifecycle order for the progress indicator */
const STATUS_ORDER: SpecStatus[] = ['draft', 'reviewed', 'decomposed', 'active', 'completed'];

function formatDate(isoString: string | null): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(isoString: string | null): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SpecDashboard({ projectPath, onSpecSelect }: SpecDashboardProps) {
  const [specs, setSpecs] = useState<SpecInfo[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const [specTasks, setSpecTasks] = useState<SpecTasks | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useCallback(
    (endpoint: string) => {
      const separator = endpoint.includes('?') ? '&' : '?';
      return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
    },
    [projectPath]
  );

  // Fetch all specs on mount
  useEffect(() => {
    async function fetchSpecs() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl('/api/specs'));
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setSpecs(data.specs || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch specs');
      } finally {
        setIsLoading(false);
      }
    }
    fetchSpecs();
  }, [apiUrl]);

  // Fetch tasks when a spec is selected
  useEffect(() => {
    if (!selectedSpec) {
      setSpecTasks(null);
      return;
    }

    const specId = selectedSpec;

    async function fetchTasks() {
      setIsLoadingTasks(true);
      try {
        const res = await fetch(apiUrl(`/api/specs/${encodeURIComponent(specId)}/tasks`));
        const data = await res.json();
        if (data.error) {
          console.error('Failed to fetch tasks:', data.error);
          setSpecTasks(null);
        } else {
          setSpecTasks(data);
        }
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
        setSpecTasks(null);
      } finally {
        setIsLoadingTasks(false);
      }
    }
    fetchTasks();
  }, [selectedSpec, apiUrl]);

  const handleSpecClick = (specId: string) => {
    setSelectedSpec(selectedSpec === specId ? null : specId);
    onSpecSelect?.(specId);
  };

  const selectedSpecInfo = specs.find((s) => s.specId === selectedSpec);

  if (isLoading) {
    return (
      <div className="spec-dashboard">
        <div className="spec-dashboard__loading">Loading specs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="spec-dashboard">
        <div className="spec-dashboard__error">
          <p>Error: {error}</p>
          <p>Make sure you have specs in the .ralph/specs directory.</p>
        </div>
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div className="spec-dashboard">
        <div className="spec-dashboard__empty">
          <h3>No specs found</h3>
          <p>
            Create a spec using the Spec Explorer or run <code>qala spec create</code> from the CLI.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="spec-dashboard">
      {/* Spec List */}
      <div className="spec-dashboard__list">
        <div className="spec-dashboard__header">
          <h2>Specs ({specs.length})</h2>
        </div>

        <div className="spec-dashboard__items">
          {specs.map((spec) => {
            const config = STATUS_CONFIG[spec.status];
            const isSelected = selectedSpec === spec.specId;

            return (
              <button
                key={spec.specId}
                className={`spec-card ${isSelected ? 'spec-card--selected' : ''}`}
                onClick={() => handleSpecClick(spec.specId)}
              >
                <div className="spec-card__header">
                  <span className="spec-card__name">{spec.specId}</span>
                  <span className={`spec-status ${config.className}`}>{config.label}</span>
                </div>
                <div className="spec-card__meta">
                  <span className="spec-card__date">
                    Created: {formatDate(spec.created)}
                  </span>
                  <span className="spec-card__date">
                    Modified: {formatDate(spec.lastModified)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Spec Detail Panel */}
      {selectedSpec && selectedSpecInfo && (
        <div className="spec-dashboard__detail">
          <div className="spec-detail__header">
            <h3>{selectedSpecInfo.specId}</h3>
            <span className={`spec-status spec-status--large ${STATUS_CONFIG[selectedSpecInfo.status].className}`}>
              {STATUS_CONFIG[selectedSpecInfo.status].label}
            </span>
          </div>

          {/* Status Progress */}
          <div className="spec-detail__progress">
            <div className="status-progress">
              {STATUS_ORDER.map((status, index) => {
                const currentIndex = STATUS_ORDER.indexOf(selectedSpecInfo.status);
                const isPast = index < currentIndex;
                const isCurrent = index === currentIndex;

                let stepClass = 'status-step';
                if (isPast) {
                  stepClass += ' status-step--past';
                } else if (isCurrent) {
                  stepClass += ' status-step--current';
                } else {
                  stepClass += ' status-step--future';
                }

                return (
                  <div key={status} className={stepClass}>
                    <div className="status-step__dot" />
                    <span className="status-step__label">{STATUS_CONFIG[status].label}</span>
                  </div>
                );
              })}
              <div className="status-progress__line" />
            </div>
          </div>

          {/* Metadata */}
          <div className="spec-detail__metadata">
            <div className="metadata-item">
              <span className="metadata-label">Created</span>
              <span className="metadata-value">{formatDateTime(selectedSpecInfo.created)}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Last Modified</span>
              <span className="metadata-value">{formatDateTime(selectedSpecInfo.lastModified)}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Spec Path</span>
              <span className="metadata-value metadata-value--path">{selectedSpecInfo.specPath}</span>
            </div>
          </div>

          {/* Tasks Section */}
          <div className="spec-detail__tasks">
            <h4>Tasks</h4>
            {isLoadingTasks ? (
              <div className="spec-detail__tasks-loading">Loading tasks...</div>
            ) : specTasks && specTasks.tasks.length > 0 ? (
              <>
                <TaskStats tasks={specTasks.tasks} />
                <div className="task-list">
                  {specTasks.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`task-item ${task.passes ? 'task-item--completed' : 'task-item--pending'}`}
                    >
                      <span className="task-item__id">{task.id}</span>
                      <span className="task-item__title">{task.title}</span>
                      <span className={`task-item__status ${task.passes ? 'task-item__status--done' : ''}`}>
                        {task.passes ? '✓' : '○'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="spec-detail__tasks-empty">
                <p>No tasks yet. Run decomposition to generate tasks from this spec.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TaskStatsProps {
  tasks: UserStory[];
}

function TaskStats({ tasks }: TaskStatsProps) {
  const stats = calculateStats(tasks);
  const percentComplete = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="task-stats">
      <div className="task-stats__bar">
        <div className="task-stats__fill" style={{ width: `${percentComplete}%` }} />
      </div>
      <div className="task-stats__numbers">
        <span className="task-stats__completed">{stats.completed} completed</span>
        <span className="task-stats__separator">·</span>
        <span className="task-stats__ready">{stats.ready} ready</span>
        <span className="task-stats__separator">·</span>
        <span className="task-stats__blocked">{stats.blocked} blocked</span>
        <span className="task-stats__separator">·</span>
        <span className="task-stats__total">{stats.total} total</span>
      </div>
    </div>
  );
}
