import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import type { PRDData, RalphStatus, DecomposeState, PeerFeedback } from './types';
import { calculateStats } from './types';
import { StatsBar } from './components/StatsBar';
import { TaskList } from './components/TaskList';
import { KanbanView } from './components/KanbanView';
import { LiveExecutionView } from './components/LiveExecutionView';
import { ProgressView } from './components/ProgressView';
import { DecomposeView } from './components/DecomposeView';
import { SettingsView } from './components/SettingsView';
import { KnowledgeView } from './components/KnowledgeView';
import { SpecExplorer, SpecDashboard } from './components/specs';
import { QueueView } from './components/queue';
import { TopNav } from './components/TopNav';
import './App.css';

interface ProjectEntry {
  name: string;
  path: string;
  status: string;
  lastActivity: string;
}

// ExecutionView as a separate component to prevent remounting on parent re-renders
interface ExecutionViewProps {
  prdData: PRDData | null;
  error: string | null;
  ralphStatus: RalphStatus;
  iterationLog: string;
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
  error,
  ralphStatus,
  iterationLog,
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
        <header className="execution-header">
          <StatsBar
            stats={stats}
            projectName={prdData.projectName || projectName}
            branchName={prdData.branchName}
            ralphStatus={ralphStatus}
          />
          <div className="header-actions">
            {!ralphStatus.running ? (
              <button className="btn-primary" onClick={onStartRalph} disabled={stats.ready === 0}>
                Start Ralph
              </button>
            ) : (
              <button className="btn-danger" onClick={onStopRalph}>
                Stop Ralph
              </button>
            )}
          </div>
        </header>
      )}

      {error && !prdData && (
        <div className="no-data">
          <h2>No prd.json found</h2>
          <p>Use the Decompose tab to generate tasks from a PRD file.</p>
          <button className="btn-secondary" onClick={() => onNavigate('/decompose')}>
            Go to Decompose
          </button>
        </div>
      )}

      {prdData && (
        <>
          {/* Execution Tabs */}
          <nav className="tab-nav">
            <button
              className={`tab-btn ${executionTab === 'live' ? 'active' : ''}`}
              onClick={() => onNavigate('/execution/live')}
            >
              Live
              {ralphStatus.running && <span className="tab-live-indicator" />}
            </button>
            <button
              className={`tab-btn ${executionTab === 'kanban' ? 'active' : ''}`}
              onClick={() => onNavigate('/execution/kanban')}
            >
              Board
            </button>
            <button
              className={`tab-btn ${executionTab === 'list' ? 'active' : ''}`}
              onClick={() => onNavigate('/execution/list')}
            >
              List ({prdData?.userStories?.length || 0})
            </button>
            <button
              className={`tab-btn ${executionTab === 'log' ? 'active' : ''}`}
              onClick={() => onNavigate('/execution/log')}
            >
              Log
            </button>
            <button
              className={`tab-btn ${executionTab === 'knowledge' ? 'active' : ''}`}
              onClick={() => onNavigate('/execution/knowledge')}
            >
              Knowledge
              {peerFeedback && peerFeedback.lessonsLearned.length > 0 && (
                <span className="tab-count">{peerFeedback.lessonsLearned.length}</span>
              )}
            </button>
          </nav>

          {/* Tab Content */}
          <div className={`tab-content ${executionTab === 'kanban' || executionTab === 'live' ? 'kanban-active' : ''}`}>
            {executionTab === 'live' && prdData?.userStories && (
              <LiveExecutionView
                stories={prdData.userStories}
                currentStory={ralphStatus.currentStory}
                iterationLog={iterationLog}
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
  const [prdData, setPrdData] = useState<PRDData | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [iterationLog, setIterationLog] = useState<string>('');
  const [currentIteration, setCurrentIteration] = useState<number | null>(null);
  const [ralphStatus, setRalphStatus] = useState<RalphStatus>(defaultStatus);
  const [decomposeState, setDecomposeState] = useState<DecomposeState>({ status: 'IDLE', message: '' });
  const [peerFeedback, setPeerFeedback] = useState<PeerFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Removed navCollapsed state - using top nav now

  // Get selected project from URL params
  const selectedProject = searchParams.get('project');

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

  // Fetch list of projects
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
      // Auto-select first project if none selected
      if (!selectedProject && data.length > 0) {
        setSearchParams({ project: data[0].path });
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  }, [selectedProject, setSearchParams]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedProject) {
      setLoading(false);
      return;
    }

    try {
      // Fetch sequentially to reduce file descriptor usage
      const statusRes = await fetch(apiUrl('/api/ralph/status'));
      const statusData = await statusRes.json();
      setRalphStatus({
        running: statusData.status === 'running',
        status: statusData.status,
        currentIteration: statusData.currentIteration || 0,
        maxIterations: statusData.maxIterations || 0,
        currentStory: statusData.currentStory || null,
      });

      const tasksRes = await fetch(apiUrl('/api/tasks'));
      const tasksData = await tasksRes.json();
      if (tasksData.error) {
        setError(tasksData.error);
        setPrdData(null);
      } else {
        setPrdData(tasksData);
        setError(null);
      }

      const decomposeRes = await fetch(apiUrl('/api/decompose/state'));
      const decomposeData = await decomposeRes.json();
      setDecomposeState({
        status: decomposeData.status?.toUpperCase() || 'IDLE',
        message: decomposeData.message || '',
      });

      // Update currentIteration from status
      setCurrentIteration(statusData.currentIteration || null);

      // Fetch raw JSONL when running - ChatLogView will parse it
      if (statusData.status === 'running' && statusData.currentIteration) {
        const currentIterationLog = `iteration_${statusData.currentIteration}.jsonl`;
        try {
          const logRes = await fetch(apiUrl(`/api/ralph/logs/${currentIterationLog}`));
          if (logRes.ok) {
            const rawJsonl = await logRes.text();
            setIterationLog(rawJsonl);
          }
        } catch (logErr) {
          console.warn('Failed to fetch current iteration log:', logErr);
        }
      } else {
        setIterationLog('');
      }

      // Progress file for historical summary
      const progressRes = await fetch(apiUrl('/api/ralph/progress'));
      const progressContent = await progressRes.text();
      setProgress(progressContent);

      // Peer feedback / knowledge base
      try {
        const feedbackRes = await fetch(apiUrl('/api/ralph/peer-feedback'));
        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json();
          setPeerFeedback(feedbackData);
        }
      } catch (feedbackErr) {
        console.warn('Failed to fetch peer feedback:', feedbackErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [selectedProject, apiUrl]);

  useEffect(() => {
    if (selectedProject) {
      setLoading(true);
      fetchData();
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;

    // Refresh faster when Ralph is running or decomposition is in progress
    const isActive = ralphStatus.running ||
      ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'DECOMPOSED', 'REVIEWING'].includes(decomposeState.status);
    const interval = setInterval(fetchData, isActive ? 2000 : 5000);
    return () => clearInterval(interval);
  }, [fetchData, ralphStatus.running, decomposeState.status, selectedProject]);

  const handleTasksActivated = () => {
    fetchData();
    navigateTo('/execution/live');
  };

  const handleStartRalph = async () => {
    try {
      // Don't pass maxIterations - let server calculate based on remaining tasks + 20% buffer
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
      <div className="app loading">
        <div className="no-projects">
          <h2>No Projects Found</h2>
          <p>Initialize a project with: <code>qala init</code></p>
        </div>
      </div>
    );
  }

  if (loading && !selectedProject) {
    return (
      <div className="app loading">
        <div className="loader">Loading Projects...</div>
      </div>
    );
  }

  const currentProject = projects.find(p => p.path === selectedProject);

  // Memoized props for ExecutionView to prevent unnecessary re-renders
  const executionViewProps: ExecutionViewProps = {
    prdData,
    error,
    ralphStatus,
    iterationLog,
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
    <div className="app-layout app-layout--top-nav">
      {/* Top Navigation */}
      <TopNav
        projects={projects}
        selectedProject={selectedProject}
        onProjectChange={setSelectedProject}
        onNavigate={navigateTo}
        isRalphRunning={ralphStatus.running}
      />

      {/* Main Content */}
      <main className="main-content main-content--full">
        {loading && (
          <div className="loading-overlay">
            <div className="loader">Loading...</div>
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
          <Route
            path="/queue"
            element={
              selectedProject ? (
                <QueueView
                  projectPath={selectedProject}
                  onNavigateToSpec={(specId) => navigateTo(`/spec-review?spec=${specId}`)}
                />
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
