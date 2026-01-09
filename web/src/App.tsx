import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import { Sidebar, Menu, MenuItem, sidebarClasses } from 'react-pro-sidebar';
import type { PRDData, RalphStatus, DecomposeState } from './types';
import { calculateStats } from './types';
import { StatsBar } from './components/StatsBar';
import { TaskList } from './components/TaskList';
import { KanbanView } from './components/KanbanView';
import { LiveExecutionView } from './components/LiveExecutionView';
import { ProgressView } from './components/ProgressView';
import { DecomposeView } from './components/DecomposeView';
import { SettingsView } from './components/SettingsView';
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
          </nav>

          {/* Tab Content */}
          <div className={`tab-content ${executionTab === 'kanban' || executionTab === 'live' ? 'kanban-active' : ''}`}>
            {executionTab === 'live' && prdData?.userStories && (
              <LiveExecutionView
                stories={prdData.userStories}
                currentStory={ralphStatus.currentStory}
                iterationLog={iterationLog}
                currentIteration={currentIteration}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);

  // Get selected project from URL params
  const selectedProject = searchParams.get('project');

  // Derive active section and tab from URL path
  const isDecomposePage = location.pathname.startsWith('/decompose');
  const isSettingsPage = location.pathname.startsWith('/settings');
  const executionTab = location.pathname.includes('/live') ? 'live'
    : location.pathname.includes('/list') ? 'list'
    : location.pathname.includes('/log') ? 'log'
    : 'kanban';

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
      const res = await fetch(apiUrl('/api/ralph/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxIterations: 25 }),
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

  const isDecomposeActive = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'DECOMPOSED', 'REVIEWING'].includes(decomposeState.status);
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
    onStartRalph: handleStartRalph,
    onStopRalph: handleStopRalph,
    onNavigate: navigateTo,
  };

  return (
    <div className="app-layout">
      {/* Side Navigation */}
      <Sidebar
        collapsed={navCollapsed}
        backgroundColor="#161b22"
        width="240px"
        collapsedWidth="64px"
        rootStyles={{
          [`.${sidebarClasses.container}`]: {
            borderRight: '1px solid #21262d !important',
            borderColor: '#21262d !important',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
          },
        }}
        style={{ borderRight: '1px solid #21262d' }}
      >
        <div className="sidebar-header">
          <h1 className="sidebar-logo">{navCollapsed ? 'Q' : 'Qala'}</h1>
          {!navCollapsed && projects.length > 0 && (
            <select
              className="project-selector"
              value={selectedProject || ''}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="sidebar-content">
          <Menu
            menuItemStyles={{
              button: ({ active }) => ({
                backgroundColor: active ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
                color: active ? '#58a6ff' : '#c9d1d9',
                borderRadius: '6px',
                margin: '2px 8px',
                padding: '10px 12px',
                '&:hover': {
                  backgroundColor: '#21262d',
                  color: '#ffffff',
                },
              }),
              icon: {
                color: 'inherit',
                minWidth: '24px',
              },
              label: {
                fontWeight: 500,
              },
            }}
          >
            <MenuItem
              icon={<span style={{ fontSize: '14px' }}>⚙</span>}
              active={isDecomposePage}
              onClick={() => navigateTo('/decompose')}
              suffix={isDecomposeActive && !navCollapsed ? <span className="menu-badge active">Active</span> : null}
            >
              Decompose
            </MenuItem>
            <MenuItem
              icon={<span style={{ fontSize: '12px' }}>▶</span>}
              active={!isDecomposePage && !isSettingsPage}
              onClick={() => navigateTo('/execution/live')}
              suffix={ralphStatus.running && !navCollapsed ? <span className="menu-badge running">Running</span> : null}
            >
              Execution
            </MenuItem>
          </Menu>
        </div>

        <div className="sidebar-footer">
          <Menu
            menuItemStyles={{
              button: ({ active }) => ({
                backgroundColor: active ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
                color: active ? '#58a6ff' : '#8b949e',
                borderRadius: '6px',
                margin: '2px 8px',
                padding: '10px 12px',
                '&:hover': {
                  backgroundColor: '#21262d',
                  color: '#c9d1d9',
                },
              }),
              icon: {
                color: 'inherit',
                minWidth: '24px',
              },
            }}
          >
            <MenuItem
              icon={<span style={{ fontSize: '14px' }}>⚙</span>}
              active={isSettingsPage}
              onClick={() => navigateTo('/settings')}
            >
              Settings
            </MenuItem>
          </Menu>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setNavCollapsed(!navCollapsed)}
            title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {navCollapsed ? '→' : '←'}
          </button>
        </div>
      </Sidebar>

      {/* Main Content */}
      <main className="main-content">
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
          <Route path="/execution" element={<Navigate to="/execution/live" replace />} />
          <Route path="/execution/live" element={<ExecutionView {...executionViewProps} />} />
          <Route path="/execution/kanban" element={<ExecutionView {...executionViewProps} />} />
          <Route path="/execution/list" element={<ExecutionView {...executionViewProps} />} />
          <Route path="/execution/log" element={<ExecutionView {...executionViewProps} />} />
          <Route path="*" element={<Navigate to="/execution/live" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
