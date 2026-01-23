import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import type { PRDData, RalphStatus, PeerFeedback } from './types';
import { calculateStats } from './types';
import { useUnifiedSSE } from './hooks/useUnifiedSSE';
import { StatsBar } from './components/StatsBar';
import { TaskList } from './components/TaskList';
import { KanbanView } from './components/KanbanView';
import { LiveExecutionView } from './components/LiveExecutionView';
import { ProgressView } from './components/ProgressView';
import { DecomposeView } from './components/DecomposeView';
import { SettingsView } from './components/SettingsView';
import { KnowledgeView } from './components/KnowledgeView';
import { SpecExplorer, SpecDashboard } from './components/specs';
import { TopNav } from './components/TopNav';
import './App.css';

interface ProjectEntry {
  name: string;
  path: string;
  status: string;
  lastActivity: string;
}

import type { ParsedEntry } from './utils/parseJsonl';

// ExecutionView as a separate component to prevent remounting on parent re-renders
interface ExecutionViewProps {
  prdData: PRDData | null;
  error: string | null;
  sseStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
  ralphStatus: RalphStatus;
  iterationLog: string;
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

function ExecutionView({
  prdData,
  error: _error,
  sseStatus,
  ralphStatus,
  iterationLog,
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

  return (
    <>
      {/* Stats Header */}
      {prdData && (
        <header className="bg-surface border-b border-border py-5 px-8 flex justify-between items-start gap-8">
          <div className="flex-1">
            <StatsBar
              stats={stats}
              projectName={prdData.projectName || projectName}
              branchName={prdData.branchName}
              ralphStatus={ralphStatus}
            />
          </div>
          <div className="flex gap-3 items-center shrink-0">
            {!ralphStatus.running ? (
              <button
                className="px-6 py-2.5 bg-gradient-to-br from-primary to-[#8b5cf6] border-none rounded-xl text-white text-sm font-semibold cursor-pointer transition-all duration-200 shadow-[0_2px_8px_rgba(163,113,247,0.25)] hover:from-primary-hover hover:to-primary hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(163,113,247,0.35)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
                onClick={onStartRalph}
                disabled={stats.ready === 0}
              >
                Start Ralph
              </button>
            ) : (
              <button
                className="px-6 py-2.5 bg-gradient-to-br from-blocked to-[#c93c37] border-none rounded-xl text-white text-sm font-semibold cursor-pointer transition-all duration-200 shadow-[0_2px_8px_rgba(218,54,51,0.25)] hover:from-[#f85149] hover:to-blocked hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(218,54,51,0.35)]"
                onClick={onStopRalph}
              >
                Stop Ralph
              </button>
            )}
          </div>
        </header>
      )}

      {!prdData && sseStatus === 'connecting' && (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 min-h-[400px] gap-3">
          <div className="text-5xl mb-2">⏳</div>
          <h2 className="m-0 text-2xl font-semibold text-text">Loading...</h2>
          <p className="m-0 text-sm text-text-muted max-w-[400px] leading-relaxed">Connecting to project...</p>
        </div>
      )}

      {!prdData && sseStatus === 'connected' && (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 min-h-[400px] gap-3">
          <div className="text-5xl mb-2">📋</div>
          <h2 className="m-0 text-2xl font-semibold text-text">No Tasks Yet</h2>
          <p className="m-0 text-sm text-text-muted max-w-[400px] leading-relaxed">
            No tasks have been generated for this project yet. Create a spec and decompose it into tasks to get started.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              className="px-6 py-3 bg-primary border-none rounded-lg text-white text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-primary-hover hover:-translate-y-0.5"
              onClick={() => onNavigate('/spec-review')}
            >
              Create a Spec
            </button>
            <button
              className="px-6 py-3 bg-transparent border border-border rounded-lg text-text text-sm font-medium cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-text-muted"
              onClick={() => onNavigate('/decompose')}
            >
              Go to Decompose
            </button>
          </div>
        </div>
      )}

      {prdData && (
        <>
          {/* Execution Tabs */}
          <nav className="flex gap-0 bg-surface border-b border-border px-8">
            <button
              className={`px-5 py-3 bg-transparent border-none border-b-2 cursor-pointer text-[15px] transition-all duration-200 ${
                executionTab === 'live'
                  ? 'text-accent border-b-accent'
                  : 'text-text-muted border-transparent hover:text-text'
              }`}
              onClick={() => onNavigate('/execution/live')}
            >
              Live
              {ralphStatus.running && (
                <span className="inline-block w-2 h-2 bg-running rounded-full ml-1.5 animate-pulse" />
              )}
            </button>
            <button
              className={`px-5 py-3 bg-transparent border-none border-b-2 cursor-pointer text-[15px] transition-all duration-200 ${
                executionTab === 'kanban'
                  ? 'text-accent border-b-accent'
                  : 'text-text-muted border-transparent hover:text-text'
              }`}
              onClick={() => onNavigate('/execution/kanban')}
            >
              Board
            </button>
            <button
              className={`px-5 py-3 bg-transparent border-none border-b-2 cursor-pointer text-[15px] transition-all duration-200 ${
                executionTab === 'list'
                  ? 'text-accent border-b-accent'
                  : 'text-text-muted border-transparent hover:text-text'
              }`}
              onClick={() => onNavigate('/execution/list')}
            >
              List ({prdData?.userStories?.length || 0})
            </button>
            <button
              className={`px-5 py-3 bg-transparent border-none border-b-2 cursor-pointer text-[15px] transition-all duration-200 ${
                executionTab === 'log'
                  ? 'text-accent border-b-accent'
                  : 'text-text-muted border-transparent hover:text-text'
              }`}
              onClick={() => onNavigate('/execution/log')}
            >
              Log
            </button>
            <button
              className={`px-5 py-3 bg-transparent border-none border-b-2 cursor-pointer text-[15px] transition-all duration-200 ${
                executionTab === 'knowledge'
                  ? 'text-accent border-b-accent'
                  : 'text-text-muted border-transparent hover:text-text'
              }`}
              onClick={() => onNavigate('/execution/knowledge')}
            >
              Knowledge
              {peerFeedback && peerFeedback.lessonsLearned.length > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] ml-1.5 text-[10px] font-semibold rounded-full ${
                  executionTab === 'knowledge'
                    ? 'bg-accent/20 text-accent'
                    : 'bg-surface-hover text-text-muted'
                }`}>
                  {peerFeedback.lessonsLearned.length}
                </span>
              )}
            </button>
          </nav>

          {/* Tab Content */}
          <div className={`flex-1 min-h-0 flex flex-col ${
            executionTab === 'kanban' || executionTab === 'live'
              ? 'p-0 overflow-hidden'
              : 'p-6 overflow-auto'
          }`}>
            {executionTab === 'live' && prdData?.userStories && (
              <LiveExecutionView
                stories={prdData.userStories}
                currentStory={ralphStatus.currentStory}
                iterationLog={iterationLog}
                logEntries={logEntries}
                currentIteration={currentIteration}
                maxIterations={ralphStatus.maxIterations}
                isRunning={ralphStatus.running}
              />
            )}
            {executionTab === 'kanban' && prdData?.userStories && (
              <KanbanView
                stories={prdData.userStories}
                currentStory={ralphStatus.currentStory}
                logContent={ralphStatus.running && iterationLog ? iterationLog : progress}
                iterationLog={iterationLog}
                currentIteration={currentIteration}
                isRunning={ralphStatus.running}
              />
            )}
            {executionTab === 'list' && prdData?.userStories && (
              <TaskList stories={prdData.userStories} currentStory={ralphStatus.currentStory} />
            )}
            {executionTab === 'log' && (
              <ProgressView
                content={progress}
                iterationLog={iterationLog}
                currentIteration={currentIteration}
                isRunning={ralphStatus.running}
              />
            )}
            {executionTab === 'knowledge' && (
              <KnowledgeView peerFeedback={peerFeedback} />
            )}
          </div>
        </>
      )}
    </>
  );
}

const defaultStatus: RalphStatus = {
  running: false,
  status: 'stopped',
  currentIteration: 0,
  maxIterations: 0,
  currentStory: null,
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [progress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get selected project from URL params
  const selectedProject = searchParams.get('project');

  // Use unified SSE connection for all per-project events
  const unifiedSSE = useUnifiedSSE(selectedProject);

  // Extract state from unified SSE hook
  const prdData = unifiedSSE.prdData;
  const ralphStatus = unifiedSSE.ralphStatus || defaultStatus;
  const iterationLog = unifiedSSE.iterationLog;
  const logEntries = unifiedSSE.logEntries;
  const currentIteration = unifiedSSE.currentIteration;
  const peerFeedback = unifiedSSE.peerFeedback;

  // Derive execution tab from URL path
  function getExecutionTab(pathname: string): string {
    if (pathname.includes('/live')) return 'live';
    if (pathname.includes('/list')) return 'list';
    if (pathname.includes('/log')) return 'log';
    if (pathname.includes('/knowledge')) return 'knowledge';
    return 'kanban';
  }

  const executionTab = getExecutionTab(location.pathname);

  // Helper to add project param to API calls
  const apiUrl = useCallback((endpoint: string) => {
    if (!selectedProject) return endpoint;
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(selectedProject)}`;
  }, [selectedProject]);

  // Navigate while preserving project param
  const navigateTo = useCallback((path: string) => {
    const params = selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : '';
    navigate(`${path}${params}`);
  }, [navigate, selectedProject]);

  // Update project in URL
  const setSelectedProject = useCallback((projectPath: string) => {
    setSearchParams({ project: projectPath });
  }, [setSearchParams]);

  // SSE: subscribe to Projects registry
  useEffect(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;
    const es = new EventSource('/api/events/projects');
    const apply = (list: any[]) => {
      setProjects(list);
      setLoading(false);
      if (!selectedProject && list.length > 0 && location.pathname !== '/') {
        setSearchParams({ project: list[0].path });
      }
    };
    es.addEventListener('projects/snapshot', (e: MessageEvent) => {
      try {
        console.log('[App] Received projects/snapshot:', e.data);
        const payload = JSON.parse(e.data);
        console.log('[App] Parsed payload:', payload);
        apply(payload.data);
        console.log('[App] Applied projects:', payload.data.length);
      } catch (err) {
        console.error('[App] Error processing projects/snapshot:', err, e.data);
      }
    });
    es.addEventListener('projects/updated', (e: MessageEvent) => {
      try {
        console.log('[App] Received projects/updated:', e.data);
        const payload = JSON.parse(e.data);
        apply(payload.data);
      } catch (err) {
        console.error('[App] Error processing projects/updated:', err, e.data);
      }
    });
    es.onerror = () => es.close();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!selectedProject) {
      setLoading(false);
      return;
    }

    try {
      if (signal?.aborted) return;
      setLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;

    const abortController = new AbortController();
    setLoading(true);
    fetchData(abortController.signal);

    return () => {
      abortController.abort();
      setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  const handleTasksActivated = () => {
    fetchData();
    navigateTo('/execution/live');
  };

  const handleStartRalph = async () => {
    try {
      const res = await fetch(apiUrl('/api/ralph/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to start Ralph:', err);
    }
  };

  const handleStopRalph = async () => {
    try {
      await fetch(apiUrl('/api/ralph/stop'), { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('Failed to stop Ralph:', err);
    }
  };

  // Show project selector if no projects
  if (projects.length === 0 && !loading) {
    return (
      <div className="flex h-screen max-h-screen overflow-hidden items-center justify-center">
        <div className="text-center p-12">
          <h2 className="text-text mb-4">No Projects Found</h2>
          <p className="text-text-muted">
            Initialize a project with: <code className="bg-surface-hover px-2 py-1 rounded font-mono">qala init</code>
          </p>
        </div>
      </div>
    );
  }

  if (loading && !selectedProject) {
    return (
      <div className="flex h-screen max-h-screen overflow-hidden items-center justify-center">
        <div className="text-xl text-text-muted">Loading Projects...</div>
      </div>
    );
  }

  const currentProject = projects.find(p => p.path === selectedProject);

  // Memoized props for ExecutionView to prevent unnecessary re-renders
  const executionViewProps: ExecutionViewProps = {
    prdData,
    error,
    sseStatus: unifiedSSE.connectionStatus,
    ralphStatus,
    iterationLog,
    logEntries,
    progress,
    currentIteration,
    executionTab,
    projectName: currentProject?.name || 'Unknown',
    peerFeedback,
    onStartRalph: handleStartRalph,
    onStopRalph: handleStopRalph,
    onNavigate: navigateTo,
  };

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      {/* Top Navigation */}
      <TopNav
        projects={projects}
        selectedProject={selectedProject}
        onProjectChange={setSelectedProject}
        onNavigate={navigateTo}
        isRalphRunning={ralphStatus.running}
      />

      {/* Main Content */}
      <main className="flex-1 w-full max-h-[calc(100vh-56px)] overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 bg-bg/80 flex items-center justify-center z-[100]">
            <div className="text-xl text-text-muted">Loading...</div>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/execution/live" replace />} />
          <Route
            path="/decompose"
            element={
              selectedProject ? (
                <DecomposeView
                  onTasksActivated={handleTasksActivated}
                  projectPath={selectedProject}
                />
              ) : null
            }
          />
          <Route path="/settings" element={<SettingsView />} />
          <Route
            path="/specs"
            element={
              selectedProject ? (
                <SpecDashboard projectPath={selectedProject} />
              ) : null
            }
          />
          <Route
            path="/spec-review"
            element={
              selectedProject ? (
                <SpecExplorer projectPath={selectedProject} />
              ) : null
            }
          />
          <Route path="/execution" element={<Navigate to="/execution/live" replace />} />
          <Route path="/execution/live" element={<ExecutionView {...executionViewProps} />} />
          <Route path="/execution/kanban" element={<ExecutionView {...executionViewProps} />} />
          <Route path="/execution/list" element={<ExecutionView {...executionViewProps} />} />
          <Route path="/execution/log" element={<ExecutionView {...executionViewProps} />} />
          <Route path="/execution/knowledge" element={<ExecutionView {...executionViewProps} />} />
          <Route path="*" element={<Navigate to="/execution/live" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
