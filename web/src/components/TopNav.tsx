import { useLocation } from "react-router-dom";
import { ProjectSelector } from "./ProjectSelector";

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

interface NavItemProps {
  icon: string;
  label: string;
  active: boolean;
  badge?: { text: string; type: 'active' | 'running' };
  onClick: () => void;
}

function NavItem({ icon, label, active, badge, onClick }: NavItemProps) {
  return (
    <button
      className={`flex items-center gap-2 px-4 py-2.5 bg-transparent border-none rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap ${
        active
          ? "bg-accent/12 text-accent hover:bg-accent/18"
          : "text-text-muted hover:bg-white/6 hover:text-text"
      }`}
      onClick={onClick}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="font-medium">{label}</span>
      {badge && (
        <span
          className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-xl tracking-wide ${
            badge.type === 'running'
              ? "bg-accent/20 text-accent animate-pulse"
              : "bg-completed/20 text-completed"
          }`}
        >
          {badge.text}
        </span>
      )}
    </button>
  );
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
    <nav className="sticky top-0 z-[1000] bg-gradient-to-b from-surface/98 to-surface/95 backdrop-blur-sm border-b border-white/6 shadow-lg">
      <div className="flex items-center justify-between h-14 px-6 max-w-full">
        {/* Left: Logo and Project Selector */}
        <div className="flex items-center gap-5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl text-accent drop-shadow-[0_0_8px_rgba(88,166,255,0.4)]">◈</span>
            <span className="text-lg font-bold text-text tracking-tight hidden md:inline">Qala</span>
          </div>

          {projects.length > 0 && (
            <ProjectSelector
              projects={projects}
              selectedProject={selectedProject}
              onProjectChange={onProjectChange}
            />
          )}
        </div>

        {/* Center: Navigation Items */}
        <div className="flex items-center gap-1">
          <NavItem
            icon="📄"
            label="Specs"
            active={isSpecsPage}
            onClick={() => onNavigate('/spec-review')}
          />
          <NavItem
            icon="▶"
            label="Execution"
            active={isExecutionPage}
            badge={
              isRalphRunning ? { text: 'Running', type: 'running' } : undefined
            }
            onClick={() => onNavigate('/execution/kanban')}
          />
        </div>

        {/* Right: Settings */}
        <div className="flex items-center gap-2">
          <button
            className={`flex items-center justify-center w-9 h-9 bg-transparent border border-transparent rounded-lg cursor-pointer transition-all duration-200 ${
              isSettingsPage
                ? "bg-accent/12 border-accent/20 text-accent"
                : "text-text-muted hover:bg-white/6 hover:border-white/8 hover:text-text"
            }`}
            onClick={() => onNavigate("/settings")}
            title="Settings"
          >
            <span className="text-base">⚙</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
