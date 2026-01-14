import { useLocation } from "react-router-dom";
import "./TopNav.css";

interface Project {
  name: string;
  path: string;
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
      className={`topnav-item ${active ? "topnav-item--active" : ""}`}
      onClick={onClick}
    >
      <span className="topnav-item-icon">{icon}</span>
      <span className="topnav-item-label">{label}</span>
      {badge && (
        <span className={`topnav-badge topnav-badge--${badge.type}`}>
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
  const isQueuePage = currentPath === "/queue";
  const isSettingsPage = currentPath === "/settings";
  const isExecutionPage = !isSpecsPage && !isQueuePage && !isSettingsPage;

  return (
    <nav className="topnav">
      <div className="topnav-content">
        {/* Left: Logo and Project Selector */}
        <div className="topnav-left">
          <div className="topnav-logo">
            <span className="topnav-logo-icon">◈</span>
            <span className="topnav-logo-text">Qala</span>
          </div>

          {projects.length > 0 && (
            <div className="topnav-project">
              <select
                className="topnav-project-select"
                value={selectedProject || ""}
                onChange={(e) => onProjectChange(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="topnav-project-chevron">▾</span>
            </div>
          )}
        </div>

        {/* Center: Navigation Items */}
        <div className="topnav-center">
          <NavItem
            icon="📄"
            label="Specs"
            active={isSpecsPage}
            onClick={() => onNavigate('/spec-review')}
          />
          <NavItem
            icon="📋"
            label="Queue"
            active={isQueuePage}
            onClick={() => onNavigate('/queue')}
          />
          <NavItem
            icon="▶"
            label="Execution"
            active={isExecutionPage}
            badge={
              isRalphRunning ? { text: 'Running', type: 'running' } : undefined
            }
            onClick={() => onNavigate('/execution/live')}
          />
        </div>

        {/* Right: Settings */}
        <div className="topnav-right">
          <button
            className={`topnav-settings ${
              isSettingsPage ? "topnav-settings--active" : ""
            }`}
            onClick={() => onNavigate("/settings")}
            title="Settings"
          >
            <span className="topnav-settings-icon">⚙</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
