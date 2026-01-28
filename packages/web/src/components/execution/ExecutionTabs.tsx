import type { RalphStatus, PeerFeedback } from '../../types';

export interface ExecutionTabsProps {
  executionTab: string;
  taskCount: number;
  ralphStatus: RalphStatus;
  peerFeedback: PeerFeedback | null;
  onNavigate: (path: string) => void;
}

interface TabItemProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

function TabItem({ active, onClick, children, badge }: TabItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all
        ${active
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
        }
      `}
    >
      {children}
      {badge}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
      )}
    </button>
  );
}

export function ExecutionTabs({
  executionTab,
  taskCount,
  ralphStatus,
  peerFeedback,
  onNavigate,
}: ExecutionTabsProps) {
  const knowledgeCount = peerFeedback?.lessonsLearned?.length || 0;

  return (
    <nav className="flex items-center border-b border-border bg-background px-4">
      <TabItem
        active={executionTab === 'live'}
        onClick={() => onNavigate('/execution/live')}
        badge={ralphStatus.running ? (
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        ) : undefined}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Live
      </TabItem>

      <TabItem
        active={executionTab === 'kanban'}
        onClick={() => onNavigate('/execution/kanban')}
        badge={
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            executionTab === 'kanban' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground/60'
          }`}>
            {taskCount}
          </span>
        }
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Board
      </TabItem>

      <TabItem
        active={executionTab === 'knowledge'}
        onClick={() => onNavigate('/execution/knowledge')}
        badge={knowledgeCount > 0 ? (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            executionTab === 'knowledge' ? 'bg-secondary/20 text-secondary' : 'bg-muted text-muted-foreground/60'
          }`}>
            {knowledgeCount}
          </span>
        ) : undefined}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Knowledge
      </TabItem>
    </nav>
  );
}
