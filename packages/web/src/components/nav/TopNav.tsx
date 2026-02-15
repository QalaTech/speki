import { useLocation, useNavigate } from "react-router-dom";
import { ProjectSelector } from "./ProjectSelector";
import {
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import {
  Cog6ToothIcon as Cog6ToothIconSolid,
} from "@heroicons/react/24/solid";

import { useSpec } from "../../contexts/SpecContext";
import { formatRelativeTime } from "../../routes/SpecWorkspace/utils";
import type { SpecType } from "../specs/types";

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
}: TopNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { activeSpec, saveStatus } = useSpec();

  const isSettingsPage = currentPath === "/settings";

  const getSpecTypeStyles = (type: SpecType) => {
    switch (type) {
      case 'prd':
        return 'text-info';
      case 'tech-spec':
        return 'text-primary';
      case 'bug':
        return 'text-error';
      default:
        return 'text-info';
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-linear-to-b from-background to-card/50 backdrop-blur-2xl border-b border-border/40 shadow-sm">
      <div className="flex items-center gap-x-2 h-14 px-3 md:px-5">
        {/* Left: Logo and Project Selector */}
        <div className="flex items-center gap-1 md:gap-3 shrink-0">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
            title="Go to Home"
          >
            <div className="p-1 rounded-lg md:rounded-xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-glass">
              <img src="/logo.svg" alt="SPEKI" className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <span className="text-lg font-bold bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent hidden sm:inline font-poppins tracking-wide">
              SPEKI
            </span>
          </button>

          {projects.length > 0 && (
            <>
              <div className="w-px h-5 md:h-6 bg-linear-to-b from-transparent via-border/50 to-transparent" />
              <ProjectSelector
                projects={projects}
                selectedProject={selectedProject}
                onProjectChange={onProjectChange}
              />
            </>
          )}
        </div>

        {/* Center: Active Spec + Save Status */}
        <div className="flex-1 flex items-center justify-center min-w-0">
          {activeSpec && (
            <div className="flex items-center gap-1.5 md:gap-2 max-w-full">
              <span className="text-xs md:text-sm font-semibold truncate text-white">
                {activeSpec.title}
              </span>
              <span
                className={`text-[8px] md:text-[10px] uppercase tracking-widest font-bold shrink-0 opacity-80 ${getSpecTypeStyles(activeSpec.type)}`}
              >
                {activeSpec.type}
              </span>
              <div className="w-px h-4 bg-border/40 mx-1" />
              <span className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                {saveStatus.isSaving ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-primary">Saving...</span>
                  </>
                ) : saveStatus.hasUnsavedChanges ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                    <span className="text-warning">Unsaved</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-success/60" />
                    {saveStatus.lastSavedAt
                      ? `Saved ${formatRelativeTime(saveStatus.lastSavedAt)}`
                      : 'Saved'}
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Right: Settings */}
        <div className="flex items-center justify-end">
          <button
            className={`flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl transition-all duration-200 ${
              isSettingsPage
                ? "bg-muted/80 text-foreground shadow-inner ring-1 ring-border/50"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            onClick={() => onNavigate("/settings")}
            title="Settings"
          >
            {isSettingsPage ? (
              <Cog6ToothIconSolid className="w-4 h-4 md:w-5 md:h-5" />
            ) : (
              <Cog6ToothIcon className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );

}
