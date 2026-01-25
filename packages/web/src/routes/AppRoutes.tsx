import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ExecutionViewProps } from "../components/execution/ExecutionView";
import { ExecutionView } from "../components/execution/ExecutionView";
import { SpecDashboard, SpecExplorer } from "../components/specs";
import { DecomposeView } from "./DecomposeView";
import { SettingsView } from "./SettingsView";
import { HomePage } from "./HomePage";

// Redirect component that preserves query parameters
function RedirectWithParams({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

export interface AppRoutesProps {
  selectedProject: string | null;
  executionViewProps: ExecutionViewProps;
  onTasksActivated: () => void;
}

export function AppRoutes({
  selectedProject,
  executionViewProps,
  onTasksActivated,
}: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/decompose"
        element={
          selectedProject ? (
            <DecomposeView
              onTasksActivated={onTasksActivated}
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
        path="/execution"
        element={<RedirectWithParams to="/execution/live" />}
      />
      {/* All execution sub-routes use the same component - tab is derived from URL */}
      <Route
        path="/execution/*"
        element={<ExecutionView {...executionViewProps} />}
      />
      <Route path="*" element={<RedirectWithParams to="/spec-review" />} />
    </Routes>
  );
}
