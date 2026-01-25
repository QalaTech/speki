import { useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopNav } from './components/nav/TopNav';
import { AppRoutes } from './routes';
import type { ExecutionViewProps } from './components/execution/ExecutionView';
import {
  useProjects,
  useStartRalph,
  useStopRalph,
  useProjectsSSE,
} from '@features/projects';
import {
  useExecutionSSE,
  useExecutionStatus,
  useExecutionLogs,
  useExecutionTasks,
  useExecutionPeer,
  useExecutionConnection,
  useExecutionNavigation,
  defaultRalphStatus,
} from '@features/execution';

function App() {
  const [searchParams, setSearchParams] = useSearchParams();

  // TanStack Query: projects data and mutations
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const startRalphMutation = useStartRalph();
  const stopRalphMutation = useStopRalph();

  // SSE subscription to keep projects cache updated
  useProjectsSSE();

  const progress = '';
  const error: string | null = null;

  // Get selected project from URL params
  const selectedProject = searchParams.get('project');

  // Use the extracted navigation hook
  const { executionTab, navigateToTab } = useExecutionNavigation(selectedProject);

  // Auto-select first project if none selected
  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      setSearchParams({ project: projects[0].path });
    }
  }, [selectedProject, projects, setSearchParams]);

  // SSE subscription to keep execution caches updated
  useExecutionSSE(selectedProject);

  // Read execution data from TanStack Query cache
  const { data: ralphStatus } = useExecutionStatus(selectedProject);
  const { data: executionLogs } = useExecutionLogs(selectedProject);
  const { data: prdData } = useExecutionTasks(selectedProject);
  const { data: peerFeedback } = useExecutionPeer(selectedProject);
  const { data: connectionStatus } = useExecutionConnection(selectedProject);

  // Extract state from execution logs
  const logEntries = executionLogs?.entries ?? [];
  const currentIteration = executionLogs?.currentIteration ?? null;

  // Update project in URL
  const setSelectedProject = useCallback((projectPath: string) => {
    setSearchParams({ project: projectPath });
  }, [setSearchParams]);

  const handleTasksActivated = useCallback(() => {
    navigateToTab('/execution/live');
  }, [navigateToTab]);

  const handleStartRalph = useCallback(() => {
    if (selectedProject) {
      startRalphMutation.mutate({ project: selectedProject });
    }
  }, [selectedProject, startRalphMutation]);

  const handleStopRalph = useCallback(() => {
    if (selectedProject) {
      stopRalphMutation.mutate({ project: selectedProject });
    }
  }, [selectedProject, stopRalphMutation]);

  const loading = projectsLoading;

  // Show project selector if no projects
  if (projects.length === 0 && !loading) {
    return (
      <div className="flex h-screen max-h-screen overflow-hidden items-center justify-center">
        <div className="text-center p-12">
          <h2 className="text-base-content mb-4">No Projects Found</h2>
          <p className="text-base-content/60">
            Initialize a project with: <code className="bg-base-300 px-2 py-1 rounded font-mono">qala init</code>
          </p>
        </div>
      </div>
    );
  }

  if (loading && !selectedProject) {
    return (
      <div className="flex h-screen max-h-screen overflow-hidden items-center justify-center">
        <div className="text-xl text-base-content/60">Loading Projects...</div>
      </div>
    );
  }

  const currentProject = projects.find(p => p.path === selectedProject);

  // Props for ExecutionView
  const executionViewProps: ExecutionViewProps = {
    prdData: prdData ?? null,
    error,
    sseStatus: connectionStatus ?? 'disconnected',
    ralphStatus: ralphStatus ?? defaultRalphStatus,
    logEntries,
    progress,
    currentIteration,
    executionTab,
    projectName: currentProject?.name || 'Unknown',
    peerFeedback: peerFeedback ?? null,
    onStartRalph: handleStartRalph,
    onStopRalph: handleStopRalph,
    onNavigate: navigateToTab,
  };

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      {/* Top Navigation */}
      <TopNav
        projects={projects}
        selectedProject={selectedProject}
        onProjectChange={setSelectedProject}
        onNavigate={navigateToTab}
        isRalphRunning={(ralphStatus ?? defaultRalphStatus).running}
      />

      {/* Main Content */}
      <main className="flex-1 w-full max-h-[calc(100vh-56px)] overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 bg-base-100/80 flex items-center justify-center z-[100]">
            <div className="text-xl text-base-content/60">Loading...</div>
          </div>
        )}

        <AppRoutes
          selectedProject={selectedProject}
          executionViewProps={executionViewProps}
          onTasksActivated={handleTasksActivated}
        />
      </main>
    </div>
  );
}

export default App;
