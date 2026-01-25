import type { UserStory, RalphStatus, PeerFeedback } from '../../types';
import { KanbanView } from '../tasks/KanbanView';
import { LiveExecutionView } from '../../routes/LiveExecutionView';
import { KnowledgeView } from '../../routes/KnowledgeView';
import type { ParsedEntry } from '../../utils/parseJsonl';

export interface ExecutionContentProps {
  executionTab: string;
  stories: UserStory[];
  ralphStatus: RalphStatus;
  logEntries: ParsedEntry[];
  progress: string;
  currentIteration: number | null;
  peerFeedback: PeerFeedback | null;
}

export function ExecutionContent({
  executionTab,
  stories,
  ralphStatus,
  logEntries,
  progress: _progress,
  currentIteration,
  peerFeedback,
}: ExecutionContentProps) {
  const containerClass = `flex-1 min-h-0 flex flex-col ${
    executionTab === 'kanban' || executionTab === 'live'
      ? 'p-0 overflow-hidden'
      : 'p-6 overflow-auto'
  }`;

  return (
    <div className={containerClass}>
      {executionTab === 'live' && (
        <LiveExecutionView
          stories={stories}
          currentStory={ralphStatus.currentStory}
          logEntries={logEntries}
          currentIteration={currentIteration}
          maxIterations={ralphStatus.maxIterations}
          isRunning={ralphStatus.running}
        />
      )}
      {executionTab === 'kanban' && (
        <KanbanView
          stories={stories}
          currentStory={ralphStatus.currentStory}
        />
      )}
      {executionTab === 'knowledge' && (
        <KnowledgeView peerFeedback={peerFeedback} />
      )}
    </div>
  );
}
