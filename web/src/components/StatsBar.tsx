import type { StoryStats, RalphStatus } from '../types';

interface StatsBarProps {
  stats: StoryStats;
  projectName: string;
  branchName: string;
  ralphStatus: RalphStatus;
}

export function StatsBar({ stats, projectName, branchName, ralphStatus }: StatsBarProps) {
  const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="stats-bar">
      <div className="stats-header">
        <div className="project-info">
          <div className="project-title-row">
            <h1>{projectName}</h1>
            <span className={`ralph-status-badge ${ralphStatus.running ? 'running' : 'stopped'}`}>
              {ralphStatus.running ? (
                <>
                  <span className="pulse-dot" />
                  Running ({ralphStatus.currentIteration}/{ralphStatus.maxIterations})
                </>
              ) : (
                'Stopped'
              )}
            </span>
          </div>
          <span className="branch-name">{branchName}</span>
          {ralphStatus.running && ralphStatus.currentStory && (
            <div className="current-story-info">
              Working on: <strong>{ralphStatus.currentStory}</strong>
            </div>
          )}
        </div>
        <div className="stats-summary">
          <div className="stat completed">
            <span className="stat-value">{stats.completed}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat ready">
            <span className="stat-value">{stats.ready}</span>
            <span className="stat-label">Ready</span>
          </div>
          <div className="stat blocked">
            <span className="stat-value">{stats.blocked}</span>
            <span className="stat-label">Blocked</span>
          </div>
          <div className="stat total">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total</span>
          </div>
        </div>
      </div>
      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${percentage}%` }} />
        <span className="progress-text">{percentage}% Complete</span>
      </div>
    </div>
  );
}
