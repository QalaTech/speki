import { Navigate, Route, Routes } from "react-router-dom";
import type { ExecutionViewProps } from "../components/execution/ExecutionView";
import { ExecutionView } from "../components/execution/ExecutionView";
import { SpecDashboard, SpecExplorer } from "../components/specs";
import { DecomposeView } from "./DecomposeView";
import { SettingsView } from "./SettingsView";

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
      <Route path="/" element={<Navigate to="/spec-review" replace />} />
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
        element={<Navigate to="/execution/live" replace />}
      />
      {/* All execution sub-routes use the same component - tab is derived from URL */}
      <Route
        path="/execution/*"
        element={<ExecutionView {...executionViewProps} />}
      />
      <Route path="*" element={<Navigate to="/spec-review" replace />} />
    </Routes>
  );
}
