import { useLocation } from "react-router-dom";
import { ProjectSelector } from "./ProjectSelector";
import {
  DocumentTextIcon,
  PlayIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import {
  DocumentTextIcon as DocumentTextIconSolid,
  PlayIcon as PlayIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
} from "@heroicons/react/24/solid";

interface Project {
  name: string;
  path: string;
  status: string;
  lastActivity: string;
}

interface TopNavProps {
  projects: Project[];
  selectedProject: string | null;
  onProjectChange: (path: string) => void;
  onNavigate: (path: string) => void;
  isRalphRunning?: boolean;
}

export function TopNav({
  projects,
  selectedProject,
  onProjectChange,
  onNavigate,
  isRalphRunning,
}: TopNavProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  const isSpecsPage = currentPath.startsWith("/specs") || currentPath.startsWith("/spec-review");
  const isSettingsPage = currentPath === "/settings";
  const isExecutionPage = !isSpecsPage && !isSettingsPage;

  return (
    <nav className="sticky top-0 z-[1000] bg-gradient-to-b from-base-100 to-base-200/80 backdrop-blur-xl border-b border-base-content/5 shadow-lg shadow-base-content/5">
      <div className="flex items-center justify-between h-14 px-5">
        {/* Left: Logo and Project Selector */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 ring-1 ring-primary/10">
              <img src="/logo.svg" alt="SPEKI" className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-base-content to-base-content/70 bg-clip-text text-transparent hidden sm:inline font-poppins tracking-wide">
              SPEKI
            </span>
          </div>

          {projects.length > 0 && (
            <>
              <div className="w-px h-6 bg-gradient-to-b from-transparent via-base-content/20 to-transparent" />
              <ProjectSelector
                projects={projects}
                selectedProject={selectedProject}
                onProjectChange={onProjectChange}
              />
            </>
          )}
        </div>

        {/* Center: Navigation Tabs */}
        <div className="flex items-center">
          <div className="flex bg-base-300/40 backdrop-blur-sm rounded-xl p-1 ring-1 ring-base-content/5 shadow-inner">
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isSpecsPage
                  ? "bg-base-100 text-base-content shadow-md shadow-base-content/10 ring-1 ring-base-content/5"
                  : "text-base-content/50 hover:text-base-content hover:bg-base-100/50"
              }`}
              onClick={() => onNavigate('/spec-review')}
            >
              {isSpecsPage ? (
                <DocumentTextIconSolid className="w-4 h-4 text-primary" />
              ) : (
                <DocumentTextIcon className="w-4 h-4" />
              )}
              <span>Specs</span>
            </button>
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isExecutionPage
                  ? "bg-base-100 text-base-content shadow-md shadow-base-content/10 ring-1 ring-base-content/5"
                  : "text-base-content/50 hover:text-base-content hover:bg-base-100/50"
              }`}
              onClick={() => onNavigate('/execution/kanban')}
            >
              {isExecutionPage ? (
                <PlayIconSolid className="w-4 h-4 text-success" />
              ) : (
                <PlayIcon className="w-4 h-4" />
              )}
              <span>Execution</span>
              {isRalphRunning && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right: Settings */}
        <div className="flex items-center">
          <button
            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 ${
              isSettingsPage
                ? "bg-base-300/80 text-base-content shadow-inner ring-1 ring-base-content/5"
                : "text-base-content/50 hover:bg-base-300/50 hover:text-base-content"
            }`}
            onClick={() => onNavigate("/settings")}
            title="Settings"
          >
            {isSettingsPage ? (
              <Cog6ToothIconSolid className="w-5 h-5" />
            ) : (
              <Cog6ToothIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );

}
