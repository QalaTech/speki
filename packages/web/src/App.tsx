import { useEffect, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { TopNav } from './components/nav/TopNav';
import { AppRoutes } from './routes';
import { Toaster } from './components/ui/sonner';
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
  const location = useLocation();
  const isHomePage = location.pathname === '/';

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

  // Only auto-select first project if on a route that requires one (not home page)
  useEffect(() => {
    const currentPath = window.location.pathname;
    const requiresProject = currentPath !== '/' && currentPath !== '';
    if (!selectedProject && projects.length > 0 && requiresProject) {
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

  // Redirect to home page if no projects (except if already on home page)
  // The home page handles the "no projects" state with its own UI

  // Don't block render - let individual pages handle their loading states
  // This prevents the entire app from freezing during initial load

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

  // Home page has its own layout without TopNav
  if (isHomePage) {
    return (
      <div className="flex flex-col h-screen max-h-screen overflow-auto">
        <AppRoutes
          selectedProject={selectedProject}
          executionViewProps={executionViewProps}
          onTasksActivated={handleTasksActivated}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      <Toaster 
        position="top-center" 
        toastOptions={{
          className: "z-2000",
          classNames: {
            toast: "!bg-card/98 !backdrop-blur-2xl !border-white/5 !ring-1 !ring-white/[0.03] !shadow-[0_12px_48px_rgba(0,0,0,0.7)] !rounded-2xl !px-6 !py-4",
            title: "!text-foreground !font-semibold !text-sm",
            description: "!text-muted-foreground !text-xs",
            icon: "!w-5 !h-5 !mt-0.5",
          }
        }}
      />
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
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-100">
            <div className="text-xl text-muted-foreground">Loading...</div>
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
