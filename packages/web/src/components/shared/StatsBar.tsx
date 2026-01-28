import type { StoryStats, RalphStatus } from '../../types';
import { Badge } from '../ui';

interface StatsBarProps {
  stats: StoryStats;
  projectName: string;
  branchName: string;
  ralphStatus: RalphStatus;
}

export function StatsBar({ stats, projectName, branchName, ralphStatus }: StatsBarProps) {
  const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="flex-1">
      {/* Header row */}
      <div className="flex items-start justify-between gap-6 mb-3">
        {/* Project info */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold truncate">{projectName}</h1>
            <Badge
              variant={ralphStatus.running ? 'primary' : 'ghost'}
              size="sm"
              className={ralphStatus.running ? 'animate-pulse shrink-0' : 'shrink-0'}
            >
              {ralphStatus.running ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-content mr-1.5" />
                  Iteration {ralphStatus.currentIteration}/{ralphStatus.maxIterations}
                </>
              ) : (
                'Idle'
              )}
            </Badge>
          </div>
          <span className="text-xs font-mono text-muted-foreground/50">{branchName}</span>
          {ralphStatus.running && ralphStatus.currentStory && (
            <div className="text-sm mt-1 text-muted-foreground/70">
              <span className="text-primary font-medium">{ralphStatus.currentStory}</span>
            </div>
          )}
        </div>

        {/* Stats summary - compact */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success"></span>
            <span className="text-sm font-semibold">{stats.completed}</span>
            <span className="text-xs text-muted-foreground/50">done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-info"></span>
            <span className="text-sm font-semibold">{stats.ready}</span>
            <span className="text-xs text-muted-foreground/50">ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-error"></span>
            <span className="text-sm font-semibold">{stats.blocked}</span>
            <span className="text-xs text-muted-foreground/50">blocked</span>
          </div>
          <div className="text-sm text-muted-foreground/50 pl-2 border-l border-border">
            {stats.total} total
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground/50">Progress</span>
          <span className="font-medium text-foreground">{percentage}%</span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
