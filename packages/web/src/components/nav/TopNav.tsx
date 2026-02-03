import { useLocation, useNavigate } from "react-router-dom";
import { ProjectSelector } from "./ProjectSelector";
import {
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import {
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
}: TopNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const isSettingsPage = currentPath === "/settings";

  return (
    <nav className="sticky top-0 z-50 bg-linear-to-b from-background to-card/50 backdrop-blur-2xl border-b border-border/40 shadow-sm">
      <div className="flex items-center h-14 px-5">
        {/* Left: Logo and Project Selector */}
        <div className="flex-1 flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
            title="Go to Home"
          >
            <div className="p-1.5 rounded-xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-glass">
              <img src="/logo.svg" alt="SPEKI" className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent hidden sm:inline font-poppins tracking-wide">
              SPEKI
            </span>
          </button>

          {projects.length > 0 && (
            <>
              <div className="w-px h-6 bg-linear-to-b from-transparent via-border/50 to-transparent" />
              <ProjectSelector
                projects={projects}
                selectedProject={selectedProject}
                onProjectChange={onProjectChange}
              />
            </>
          )}
        </div>

        {/* Right: Settings */}
        <div className="flex-1 flex items-center justify-end">
          <button
            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 ${
              isSettingsPage
                ? "bg-muted/80 text-foreground shadow-inner ring-1 ring-border/50"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
