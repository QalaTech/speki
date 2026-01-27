import { useState, useEffect, useCallback } from 'react';
import type { UserStory } from '../../types';
import { calculateStats } from '../../types';
import { apiFetch } from '../ui/ErrorContext';

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
        const res = await apiFetch(apiUrl('/api/specs'));
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
        const res = await apiFetch(apiUrl(`/api/specs/${encodeURIComponent(specId)}/tasks`));
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

  // Status badge styles using ShadCN theme colors
  const statusStyles: Record<SpecStatus, string> = {
    draft: 'bg-muted text-muted-foreground',
    reviewed: 'bg-info/20 text-info',
    decomposed: 'bg-secondary/20 text-secondary',
    active: 'bg-warning/20 text-warning',
    completed: 'bg-success/20 text-success',
  };

  if (isLoading) {
    return (
      <div className="flex gap-6 p-6 h-full overflow-hidden">
        <div className="flex flex-col items-center justify-center w-full p-12 text-center text-muted-foreground">Loading specs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex gap-6 p-6 h-full overflow-hidden">
        <div className="flex flex-col items-center justify-center w-full p-12 text-center text-blocked">
          <p>Error: {error}</p>
          <p>Make sure you have specs in the .speki/specs directory.</p>
        </div>
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div className="flex gap-6 p-6 h-full overflow-hidden">
        <div className="flex flex-col items-center justify-center w-full p-12 text-center text-muted-foreground">
          <h3 className="m-0 mb-2 text-foreground">No specs found</h3>
          <p>
            Create a spec using the Spec Explorer or run <code className="py-0.5 px-1.5 bg-muted rounded text-sm">qala spec create</code> from the CLI.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 p-6 h-full overflow-hidden animate-in fade-in duration-500">
      {/* Spec List */}
      <div className="flex-[0_0_320px] flex flex-col bg-card/50 backdrop-blur-md border border-border rounded-xl overflow-hidden shadow-glass">
        <div className="py-4 px-5 border-b border-border bg-muted/30">
          <h2 className="m-0 text-base font-semibold text-foreground flex items-center gap-2">
            Specs 
            <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {specs.length}
            </span>
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-3 animate-stagger-in">
          {specs.map((spec) => {
            const isSelected = selectedSpec === spec.specId;

            return (
              <button
                key={spec.specId}
                className={`w-full flex flex-col gap-2 py-3.5 px-4 mb-2 border rounded-xl cursor-pointer text-left transition-all duration-300 hover-lift-sm active-press ${
                  isSelected 
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                    : 'border-border bg-background/50 hover:bg-muted/50 hover:border-border/80'
                }`}
                onClick={() => handleSpecClick(spec.specId)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    {spec.specId}
                  </span>
                  <span className={`inline-flex items-center py-0.5 px-2 text-[10px] font-bold uppercase tracking-wider rounded-md whitespace-nowrap shadow-sm ${statusStyles[spec.status]}`}>
                    {STATUS_CONFIG[spec.status].label}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    Created: {formatDate(spec.created)}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    Modified: {formatDate(spec.lastModified)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Spec Detail Panel */}
      {selectedSpec && selectedSpecInfo ? (
        <div className="flex-1 flex flex-col gap-6 bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl p-6 overflow-y-auto animate-in slide-in-from-right-4 fade-in duration-500 shadow-glass">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="m-0 text-xl font-bold tracking-tight text-foreground">{selectedSpecInfo.specId}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-mono">{selectedSpecInfo.specPath}</span>
              </p>
            </div>
            <span className={`inline-flex items-center py-1 px-3 text-[11px] font-bold uppercase tracking-wider rounded-lg whitespace-nowrap shadow-sm ${statusStyles[selectedSpecInfo.status]}`}>
              {STATUS_CONFIG[selectedSpecInfo.status].label}
            </span>
          </div>

          {/* Status Progress */}
          <div className="py-8 px-2 relative bg-muted/20 rounded-2xl overflow-hidden border border-border/30">
            <div className="absolute inset-0 bg-linear-to-r from-primary/5 to-transparent pointer-events-none" />
            <div className="relative flex justify-between items-center group">
              {STATUS_ORDER.map((status, index) => {
                const currentIndex = STATUS_ORDER.indexOf(selectedSpecInfo.status);
                const isPast = index < currentIndex;
                const isCurrent = index === currentIndex;

                return (
                  <div key={status} className="flex flex-col items-center gap-3 z-10 basis-0 grow">
                    <div className={`
                      w-5 h-5 rounded-full flex items-center justify-center transition-all duration-500
                      ${isPast 
                        ? 'bg-success text-success-content scale-100' 
                        : isCurrent 
                          ? 'bg-primary text-primary-content scale-110 shadow-[0_0_15px_rgba(var(--primary),0.5)]' 
                          : 'bg-muted border border-border text-muted-foreground scale-90'}
                    `}>
                      {isPast && <span className="text-[10px]">✓</span>}
                      {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                    </div>
                    <span className={`
                      text-[10px] font-bold uppercase tracking-widest transition-colors duration-300
                      ${isPast || isCurrent ? 'text-foreground' : 'text-muted-foreground/40'}
                    `}>
                      {STATUS_CONFIG[status].label}
                    </span>
                  </div>
                );
              })}
              {/* Progress Line Background */}
              <div className="absolute top-2.5 left-0 w-full h-[2px] bg-muted-foreground/10 z-0" />
              {/* Progress Line Foreground */}
              <div 
                className="absolute top-2.5 left-0 h-[2px] bg-linear-to-r from-success to-primary transition-all duration-1000 ease-in-out z-0" 
                style={{ width: `${(STATUS_ORDER.indexOf(selectedSpecInfo.status) / (STATUS_ORDER.length - 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted/30 border border-border/50 rounded-xl flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Created Date</span>
              <span className="text-sm font-medium text-foreground">{formatDateTime(selectedSpecInfo.created)}</span>
            </div>
            <div className="p-4 bg-muted/30 border border-border/50 rounded-xl flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Last Updated</span>
              <span className="text-sm font-medium text-foreground">{formatDateTime(selectedSpecInfo.lastModified)}</span>
            </div>
          </div>

          {/* Tasks Section */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h4 className="m-0 text-sm font-bold uppercase tracking-widest text-foreground/80">Implementation Progress</h4>
            </div>
            {isLoadingTasks ? (
              <div className="flex flex-col items-center justify-center p-12 gap-3 opacity-50">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium uppercase tracking-widest">Hydrating tasks...</span>
              </div>
            ) : specTasks && specTasks.tasks.length > 0 ? (
              <div className="space-y-6">
                <TaskStats tasks={specTasks.tasks} />
                <div className="grid grid-cols-1 gap-2 animate-stagger-in">
                  {specTasks.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`
                        group flex items-center gap-4 py-3 px-4 bg-background/40 hover:bg-muted/30 border border-border/30 rounded-xl transition-all duration-200
                        ${task.passes ? 'opacity-60 grayscale-[0.3]' : ''}
                      `}
                    >
                      <div className={`
                        w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold
                        ${task.passes ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}
                      `}>
                        {task.passes ? '✓' : task.id.replace('task-', '')}
                      </div>
                      <span className="flex-1 text-sm font-medium text-foreground/90 overflow-hidden text-ellipsis whitespace-nowrap">{task.title}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${task.passes ? 'text-success' : 'text-muted-foreground/30'}`}>
                        {task.passes ? 'Passed' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-muted/10 border border-dashed border-border rounded-2xl flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/40 text-xl font-bold">!</div>
                <p className="m-0 text-xs font-medium text-muted-foreground/60 leading-relaxed max-w-xs uppercase tracking-widest">
                  No implementation tasks found. Run decomposition to bootstrap development.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground/40 p-12 bg-muted/5 rounded-xl border border-dashed border-border/50">
           <div className="w-16 h-16 rounded-3xl bg-muted/20 flex items-center justify-center text-3xl">󰄵</div>
           <p className="font-bold uppercase tracking-[0.2em] text-sm">Select a specification</p>
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
    <div className="flex flex-col gap-4 bg-muted/10 p-4 rounded-xl border border-border/20">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Completion Rate</span>
        <span className="text-sm font-bold text-success">{percentComplete}%</span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div 
          className="h-full bg-linear-to-r from-success to-success/70 rounded-full transition-all duration-1000 ease-in-out" 
          style={{ width: `${percentComplete}%` }} 
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-widest">
        <div className="flex items-center gap-1.5 text-success">
          <div className="w-1.5 h-1.5 rounded-full bg-success" />
          {stats.completed} Done
        </div>
        <div className="flex items-center gap-1.5 text-info">
          <div className="w-1.5 h-1.5 rounded-full bg-info" />
          {stats.ready} Ready
        </div>
        <div className="flex items-center gap-1.5 text-warning">
          <div className="w-1.5 h-1.5 rounded-full bg-warning" />
          {stats.blocked} Blocked
        </div>
        <div className="flex ml-auto text-muted-foreground/50">
          {stats.total} Total
        </div>
      </div>
    </div>
  );
}
