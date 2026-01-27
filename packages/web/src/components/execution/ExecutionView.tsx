import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import type { PRDData, RalphStatus, PeerFeedback } from '../../types';
import { calculateStats } from '../../types';
import { ExecutionHeader } from './ExecutionHeader';
import { ExecutionTabs } from './ExecutionTabs';
import { ExecutionContent } from './ExecutionContent';
import { Button } from '../ui/Button';
import type { ParsedEntry } from '../../utils/parseJsonl';

export interface ExecutionViewProps {
  prdData: PRDData | null;
  error: string | null;
  sseStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
  ralphStatus: RalphStatus;
  logEntries: ParsedEntry[];
  progress: string;
  currentIteration: number | null;
  executionTab: string;
  projectName: string;
  peerFeedback: PeerFeedback | null;
  onStartRalph: () => void;
  onStopRalph: () => void;
  onNavigate: (path: string) => void;
}

export function ExecutionView({
  prdData,
  error: _error,
  sseStatus,
  ralphStatus,
  logEntries,
  progress,
  currentIteration,
  executionTab,
  projectName,
  peerFeedback,
  onStartRalph,
  onStopRalph,
  onNavigate,
}: ExecutionViewProps) {
  const stats = prdData?.userStories ? calculateStats(prdData.userStories) : { total: 0, completed: 0, ready: 0, blocked: 0 };

  // Loading state
  if (!prdData && sseStatus === 'connecting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <h2 className="mt-4 text-xl font-semibold text-base-content">Loading...</h2>
        <p className="mt-2 text-sm text-base-content/60">Connecting to project...</p>
      </div>
    );
  }

  // No tasks state (show for any non-loading state when there's no data)
  if (!prdData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-base-100">
        <div className="p-4 rounded-2xl bg-linear-to-br from-primary/20 to-secondary/20 mb-4">
          <ClipboardDocumentListIcon className="w-14 h-14 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-base-content">No Tasks Yet</h2>
        <p className="mt-2 text-sm text-base-content/60 max-w-md">
          No tasks have been generated for this project yet. Create a spec and decompose it into tasks to get started.
        </p>
        <div className="flex gap-3 mt-6">
          <Button
            variant="primary"
            onClick={() => onNavigate('/spec-review')}
            className="px-8 shadow-sm shadow-primary/20"
          >
            Create a Spec
          </Button>
        </div>
      </div>
    );
  }

  // Main execution view with data
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ExecutionHeader
        projectName={prdData.projectName || projectName}
        branchName={prdData.branchName}
        stats={stats}
        ralphStatus={ralphStatus}
        onStartRalph={onStartRalph}
        onStopRalph={onStopRalph}
      />
      <ExecutionTabs
        executionTab={executionTab}
        taskCount={prdData.userStories?.length || 0}
        ralphStatus={ralphStatus}
        peerFeedback={peerFeedback}
        onNavigate={onNavigate}
      />
      <ExecutionContent
        executionTab={executionTab}
        stories={prdData.userStories || []}
        ralphStatus={ralphStatus}
        logEntries={logEntries}
        progress={progress}
        currentIteration={currentIteration}
        peerFeedback={peerFeedback}
      />
    </div>
  );
}
