import type { RalphStatus } from '../../types';
import { Button } from '../ui/Button';

interface Stats {
  total: number;
  completed: number;
  ready: number;
  blocked: number;
}

export interface ExecutionHeaderProps {
  projectName: string;
  branchName?: string;
  stats: Stats;
  ralphStatus: RalphStatus;
  onStartRalph: () => void;
  onStopRalph: () => void;
}

export function ExecutionHeader({
  projectName,
  branchName,
  stats,
  ralphStatus,
  onStartRalph,
  onStopRalph,
}: ExecutionHeaderProps) {
  const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <header className="bg-base-200/50 border-b border-base-300">
      <div className="px-6 py-4">
        {/* Top row: Project info + Controls */}
        <div className="flex items-center justify-between gap-6 mb-4">
          {/* Left: Project info */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-base-content truncate">{projectName}</h1>
                {ralphStatus.running ? (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Running
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-base-300 text-base-content/60 text-sm">
                    Idle
                  </span>
                )}
              </div>
              {branchName && (
                <p className="text-sm text-base-content/50 font-mono mt-0.5">{branchName}</p>
              )}
            </div>
          </div>

          {/* Right: Start/Stop button */}
          <div className="flex items-center gap-3 shrink-0">
            {ralphStatus.running && ralphStatus.currentStory && (
              <div className="text-sm text-base-content/60 max-w-[200px] truncate hidden lg:block">
                Working on <span className="text-primary font-medium">{ralphStatus.currentStory}</span>
              </div>
            )}
            {!ralphStatus.running ? (
              <Button
                variant="primary"
                className="gap-2 shadow-sm shadow-primary/20"
                onClick={onStartRalph}
                disabled={stats.ready === 0}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                Start Run
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="gap-2"
                onClick={onStopRalph}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 18h9.5A2.25 2.25 0 0017 15.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
                </svg>
                Stop
              </Button>
            )}
          </div>
        </div>

        {/* Bottom row: Stats + Progress */}
        <div className="flex items-center gap-6">
          {/* Stats pills */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm font-semibold text-success">{stats.completed}</span>
              <span className="text-xs text-success/70">done</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-info/10">
              <span className="w-2 h-2 rounded-full bg-info" />
              <span className="text-sm font-semibold text-info">{stats.ready}</span>
              <span className="text-xs text-info/70">ready</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-error/10">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span className="text-sm font-semibold text-error">{stats.blocked}</span>
              <span className="text-xs text-error/70">blocked</span>
            </div>
            <div className="text-sm text-base-content/50 pl-2">
              {stats.total} total
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex-1 max-w-md">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-base-300 rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-base-content/70 w-12 text-right">{percentage}%</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
