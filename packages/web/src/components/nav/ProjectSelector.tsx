import { useState, useRef, useEffect } from 'react';

interface ProjectEntry {
  name: string;
  path: string;
  status: string;
  lastActivity: string;
}

interface ProjectSelectorProps {
  projects: ProjectEntry[];
  selectedProject: string | null;
  onProjectChange: (projectPath: string) => void;
}

export function ProjectSelector({
  projects,
  selectedProject,
  onProjectChange,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<ProjectEntry | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const currentProject = projects.find(p => p.path === selectedProject);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHoveredProject(null);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setHoveredProject(null);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleProjectHover = (project: ProjectEntry) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setHoveredProject(project);
  };

  const handleProjectLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setHoveredProject(null);
    }, 150);
  };

  const handlePreviewEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handlePreviewLeave = () => {
    setHoveredProject(null);
  };

  const handleSelect = (project: ProjectEntry) => {
    onProjectChange(project.path);
    setIsOpen(false);
    setHoveredProject(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="shrink-0 text-[8px] leading-none text-secondary animate-pulse">●</span>;
      case 'idle':
        return <span className="shrink-0 text-[8px] leading-none text-base-content/60">○</span>;
      case 'error':
        return <span className="shrink-0 text-[8px] leading-none text-blocked">●</span>;
      default:
        return <span className="shrink-0 text-[8px] leading-none text-base-content/60">○</span>;
    }
  };

  const formatLastActivity = (lastActivity: string) => {
    if (!lastActivity) return 'No activity';
    try {
      const date = new Date(lastActivity);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const getPreviewUrl = (project: ProjectEntry) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/execution/kanban?project=${encodeURIComponent(project.path)}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        className={`flex items-center justify-between gap-2 min-w-40 max-w-[200px] px-3 py-2 bg-white/4 border rounded-lg text-base-content text-[13px] font-medium cursor-pointer transition-all duration-200 ${
          isOpen
            ? "bg-white/8 border-secondary shadow-[0_0_0_3px_rgba(88,166,255,0.15)]"
            : "border-white/8 hover:bg-white/8 hover:border-white/12"
        }`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {currentProject ? (
            <>
              {getStatusIcon(currentProject.status)}
              <span className="whitespace-nowrap overflow-hidden text-ellipsis">{currentProject.name}</span>
            </>
          ) : (
            <span className="text-base-content/60">Select Project</span>
          )}
        </div>
        <span className={`shrink-0 text-[10px] text-base-content/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 flex min-w-[280px] bg-base-200 border border-base-300 rounded-xl shadow-[0_4px_6px_rgba(0,0,0,0.1),0_10px_40px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] overflow-hidden z-[1100] animate-[dropdownSlideIn_0.15s_ease-out]">
          {/* Project List */}
          <div className="flex flex-col min-w-60 max-h-[400px]">
            <div className="px-4 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-base-content/60 border-b border-base-300">
              Projects
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {projects.map((project) => (
                <button
                  key={project.path}
                  className={`flex flex-col gap-1 w-full px-3 py-2.5 bg-transparent border-none rounded-lg text-left cursor-pointer transition-all duration-150 ${
                    project.path === selectedProject
                      ? 'bg-accent/12 hover:bg-accent/18'
                      : project.path === hoveredProject?.path
                        ? 'bg-white/8'
                        : 'hover:bg-white/6'
                  }`}
                  onClick={() => handleSelect(project)}
                  onMouseEnter={() => handleProjectHover(project)}
                  onMouseLeave={handleProjectLeave}
                  role="option"
                  aria-selected={project.path === selectedProject}
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(project.status)}
                    <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden text-ellipsis ${
                      project.path === selectedProject ? 'text-secondary' : 'text-base-content'
                    }`}>
                      {project.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pl-[18px]">
                    <span className="text-[11px] text-base-content/60">
                      {formatLastActivity(project.lastActivity)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview Panel */}
          {hoveredProject && (
            <div
              className="flex flex-col w-80 border-l border-base-300 bg-base-100 animate-[previewSlideIn_0.2s_ease-out]"
              onMouseEnter={handlePreviewEnter}
              onMouseLeave={handlePreviewLeave}
            >
              <div className="flex flex-col gap-1 px-4 py-3 border-b border-base-300">
                <div className="flex items-center gap-2 text-sm font-semibold text-base-content">
                  {getStatusIcon(hoveredProject.status)}
                  <span>{hoveredProject.name}</span>
                </div>
                <span className="text-[11px] text-base-content/60 font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                  {hoveredProject.path}
                </span>
              </div>
              <div className="relative flex-1 min-h-[200px] overflow-hidden">
                <iframe
                  src={getPreviewUrl(hoveredProject)}
                  title={`Preview of ${hoveredProject.name}`}
                  className="w-[200%] h-[200%] border-none bg-base-200 scale-50 origin-top-left pointer-events-none"
                  sandbox="allow-same-origin allow-scripts"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface/80 pointer-events-none" />
              </div>
              <div className="flex justify-between px-4 py-2.5 border-t border-base-300 text-[11px] text-base-content/60">
                <span>Status: <strong className="text-base-content">{hoveredProject.status}</strong></span>
                <span>Last activity: <strong className="text-base-content">{formatLastActivity(hoveredProject.lastActivity)}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom animations */}
      <style>{`
        @keyframes dropdownSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes previewSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
