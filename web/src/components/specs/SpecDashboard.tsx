import { useState, useEffect, useCallback } from 'react';
import type { UserStory } from '../../types';
import { calculateStats } from '../../types';

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

  // Status badge styles
  const statusStyles: Record<SpecStatus, string> = {
    draft: 'bg-[#374151] text-[#9ca3af]',
    reviewed: 'bg-[#1e3a5f] text-[#60a5fa]',
    decomposed: 'bg-[#3b2960] text-[#a78bfa]',
    active: 'bg-[#78350f] text-[#fbbf24]',
    completed: 'bg-[#14532d] text-[#4ade80]',
  };

  if (isLoading) {
    return (
      <div className="flex gap-6 p-6 h-full overflow-hidden">
        <div className="flex flex-col items-center justify-center w-full p-12 text-center text-text-muted">Loading specs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex gap-6 p-6 h-full overflow-hidden">
        <div className="flex flex-col items-center justify-center w-full p-12 text-center text-blocked">
          <p>Error: {error}</p>
          <p>Make sure you have specs in the .ralph/specs directory.</p>
        </div>
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div className="flex gap-6 p-6 h-full overflow-hidden">
        <div className="flex flex-col items-center justify-center w-full p-12 text-center text-text-muted">
          <h3 className="m-0 mb-2 text-text">No specs found</h3>
          <p>
            Create a spec using the Spec Explorer or run <code className="py-0.5 px-1.5 bg-surface-hover rounded text-sm">qala spec create</code> from the CLI.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 p-6 h-full overflow-hidden">
      {/* Spec List */}
      <div className="flex-[0_0_320px] flex flex-col bg-surface rounded-lg overflow-hidden">
        <div className="py-4 px-5 border-b border-border">
          <h2 className="m-0 text-base font-semibold text-text">Specs ({specs.length})</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {specs.map((spec) => {
            const isSelected = selectedSpec === spec.specId;

            return (
              <button
                key={spec.specId}
                className={`w-full flex flex-col gap-2 py-3.5 px-4 mb-2 bg-bg border border-border rounded-lg cursor-pointer text-left transition-all duration-150 hover:bg-[#1a2433] hover:border-[#4b5563] ${isSelected ? 'border-[#3b82f6] bg-[#1a2433]' : ''}`}
                onClick={() => handleSpecClick(spec.specId)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-text text-sm overflow-hidden text-ellipsis whitespace-nowrap">{spec.specId}</span>
                  <span className={`inline-flex items-center py-0.5 px-2 text-[11px] font-medium uppercase tracking-[0.025em] rounded-full whitespace-nowrap ${statusStyles[spec.status]}`}>
                    {STATUS_CONFIG[spec.status].label}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#9ca3af]">Created: {formatDate(spec.created)}</span>
                  <span className="text-xs text-[#9ca3af]">Modified: {formatDate(spec.lastModified)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Spec Detail Panel */}
      {selectedSpec && selectedSpecInfo && (
        <div className="flex-1 flex flex-col gap-5 bg-surface rounded-lg p-5 overflow-y-auto">
          <div className="flex items-center justify-between gap-4">
            <h3 className="m-0 text-lg font-semibold text-text">{selectedSpecInfo.specId}</h3>
            <span className={`inline-flex items-center py-1 px-3 text-xs font-medium uppercase tracking-[0.025em] rounded-full whitespace-nowrap ${statusStyles[selectedSpecInfo.status]}`}>
              {STATUS_CONFIG[selectedSpecInfo.status].label}
            </span>
          </div>

          {/* Status Progress */}
          <div className="py-4">
            <div className="relative flex justify-between px-2">
              {STATUS_ORDER.map((status, index) => {
                const currentIndex = STATUS_ORDER.indexOf(selectedSpecInfo.status);
                const isPast = index < currentIndex;
                const isCurrent = index === currentIndex;

                const dotClasses = isPast
                  ? 'w-4 h-4 rounded-full bg-[#4ade80] border-2 border-[#4ade80]'
                  : isCurrent
                  ? 'w-4 h-4 rounded-full bg-[#3b82f6] border-2 border-[#3b82f6] shadow-[0_0_0_3px_rgba(59,130,246,0.3)]'
                  : 'w-4 h-4 rounded-full bg-surface-hover border-2 border-[#4b5563]';

                const labelClasses = isPast || isCurrent
                  ? 'text-[11px] font-medium uppercase tracking-[0.025em] text-[#9ca3af]'
                  : 'text-[11px] font-medium uppercase tracking-[0.025em] text-[#6b7280]';

                return (
                  <div key={status} className="flex flex-col items-center gap-2 z-10">
                    <div className={dotClasses} />
                    <span className={labelClasses}>{STATUS_CONFIG[status].label}</span>
                  </div>
                );
              })}
              <div className="absolute top-2 left-6 right-6 h-0.5 bg-border z-0" />
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 p-4 bg-bg rounded-md">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6b7280]">Created</span>
              <span className="text-sm text-text">{formatDateTime(selectedSpecInfo.created)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6b7280]">Last Modified</span>
              <span className="text-sm text-text">{formatDateTime(selectedSpecInfo.lastModified)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6b7280]">Spec Path</span>
              <span className="font-mono text-xs text-[#9ca3af] break-all">{selectedSpecInfo.specPath}</span>
            </div>
          </div>

          {/* Tasks Section */}
          <div className="flex-1 flex flex-col gap-3">
            <h4 className="m-0 text-sm font-semibold text-text">Tasks</h4>
            {isLoadingTasks ? (
              <div className="p-6 text-center text-[#6b7280] text-sm">Loading tasks...</div>
            ) : specTasks && specTasks.tasks.length > 0 ? (
              <>
                <TaskStats tasks={specTasks.tasks} />
                <div className="flex flex-col gap-1 overflow-y-auto">
                  {specTasks.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 py-2 px-3 bg-bg rounded text-[13px] ${task.passes ? 'opacity-70' : ''}`}
                    >
                      <span className="flex-[0_0_auto] font-mono text-xs text-[#6b7280]">{task.id}</span>
                      <span className="flex-1 text-text overflow-hidden text-ellipsis whitespace-nowrap">{task.title}</span>
                      <span className={`flex-[0_0_auto] text-sm ${task.passes ? 'text-[#4ade80]' : 'text-[#6b7280]'}`}>
                        {task.passes ? '✓' : '○'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-[#6b7280] text-sm">
                <p className="m-0">No tasks yet. Run decomposition to generate tasks from this spec.</p>
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
    <div className="flex flex-col gap-2">
      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
        <div className="h-full bg-[#4ade80] rounded-full transition-[width] duration-300" style={{ width: `${percentComplete}%` }} />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#4ade80]">{stats.completed} completed</span>
        <span className="text-border">·</span>
        <span className="text-[#60a5fa]">{stats.ready} ready</span>
        <span className="text-border">·</span>
        <span className="text-[#fbbf24]">{stats.blocked} blocked</span>
        <span className="text-border">·</span>
        <span className="text-text-muted">{stats.total} total</span>
      </div>
    </div>
  );
}
