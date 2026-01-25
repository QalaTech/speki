import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useInitProject, type ProjectEntry } from '@features/projects';

interface DirectoryEntry {
  name: string;
  path: string;
  hasSubdirs: boolean;
  isSpekiProject: boolean;
}

interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
}

interface PathInfo {
  originalPath: string;
  expandedPath: string;
  exists: boolean;
  isDirectory: boolean;
  isSpekiProject: boolean;
}

export function HomePage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const initProject = useInitProject();

  // New project form state
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [branch, setBranch] = useState('main');
  const [language, setLanguage] = useState<'nodejs' | 'python' | 'dotnet' | 'go'>('nodejs');
  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);

  // Folder browser state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState('~');
  const [browserData, setBrowserData] = useState<BrowseResult | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);


  // Validate path when it changes
  useEffect(() => {
    if (!projectPath.trim()) {
      setPathInfo(null);
      setPathError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/expand-path?path=${encodeURIComponent(projectPath)}`);
        const data = await response.json();

        if (response.ok) {
          setPathInfo(data);
          if (data.isSpekiProject) {
            setPathError('This directory already has a SPEKI project');
          } else if (!data.exists) {
            setPathError('Directory does not exist');
          } else if (!data.isDirectory) {
            setPathError('Path is not a directory');
          } else {
            setPathError(null);
            // Auto-fill project name from the folder name
            const expandedPath = data.expandedPath.replace(/\/+$/, ''); // Remove trailing slashes
            const folderName = expandedPath.split('/').pop() || '';
            if (folderName) {
              setProjectName(folderName);
            }
          }
        } else {
          setPathError(data.error || 'Failed to validate path');
        }
      } catch {
        setPathError('Failed to validate path');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [projectPath]);

  // Load folder browser data
  const loadBrowser = useCallback(async (path: string) => {
    setBrowserLoading(true);
    try {
      const response = await fetch(`/api/projects/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      if (response.ok) {
        setBrowserData(data);
        setBrowserPath(data.currentPath);
      }
    } catch {
      // Handle error silently
    }
    setBrowserLoading(false);
  }, []);

  // Initial browser load
  useEffect(() => {
    if (showBrowser && !browserData) {
      loadBrowser('~');
    }
  }, [showBrowser, browserData, loadBrowser]);

  const handleSelectProject = (project: ProjectEntry) => {
    navigate(`/spec-review?project=${encodeURIComponent(project.path)}`);
  };

  const handleInitProject = async () => {
    if (!projectPath || pathError || !pathInfo?.isDirectory) return;

    try {
      const result = await initProject.mutateAsync({
        path: projectPath,
        name: projectName || undefined,
        branch,
        language,
      });

      console.log('[HomePage] Init project result:', result);
      // Navigate to the new project with the project path in the URL
      const targetUrl = `/spec-review?project=${encodeURIComponent(result.path)}`;
      console.log('[HomePage] Navigating to:', targetUrl);
      navigate(targetUrl);
    } catch (err) {
      console.error('[HomePage] Init project error:', err);
      // Error handled by mutation
    }
  };

  const handleBrowserSelect = (dir: DirectoryEntry) => {
    setProjectPath(dir.path);
    setShowBrowser(false);
  };

  const handleBrowserNavigate = (path: string) => {
    loadBrowser(path);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-success';
      case 'error':
        return 'text-error';
      default:
        return 'text-base-content/60';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />;
      case 'error':
        return <span className="inline-block w-2 h-2 rounded-full bg-error" />;
      default:
        return <span className="inline-block w-2 h-2 rounded-full bg-base-content/30" />;
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

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 border-b border-base-300">
        <div className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-center gap-6">
          <img src="/avatar.png" alt="Speki" className="h-48 w-auto" />
          <div>
            <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Welcome to SPEKI
            </h1>
            <p className="text-lg text-base-content/70 max-w-2xl">
              Multi-tenant AI development orchestration. Manage your projects, review specs, and execute tasks with intelligent automation.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* New Project Section */}
        <section className="mb-12">
          {!showNewProject ? (
            <button
              onClick={() => setShowNewProject(true)}
              className="w-full p-6 border-2 border-dashed border-primary/30 rounded-xl hover:border-primary/60 hover:bg-primary/5 transition-all duration-200 group"
            >
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl text-primary group-hover:scale-110 transition-transform">+</span>
                <span className="text-lg font-medium text-primary">Create New Project</span>
              </div>
            </button>
          ) : (
            <div className="bg-base-200 rounded-xl p-6 border border-base-300">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Initialize New Project</h2>
                <button
                  onClick={() => setShowNewProject(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
              </div>

              <div className="grid gap-4">
                {/* Path Input */}
                <div>
                  <label className="block text-sm font-medium mb-2">Project Directory</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={projectPath}
                        onChange={(e) => setProjectPath(e.target.value)}
                        placeholder="~/projects/my-app or /full/path/to/project"
                        className={`input input-bordered w-full font-mono text-sm ${
                          pathError ? 'input-error' : pathInfo?.isDirectory && !pathInfo.isSpekiProject ? 'input-success' : ''
                        }`}
                      />
                      {pathInfo && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {pathInfo.isDirectory && !pathInfo.isSpekiProject ? (
                            <span className="text-success text-lg">✓</span>
                          ) : pathError ? (
                            <span className="text-error text-lg">✗</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setShowBrowser(true)}
                      className="btn btn-outline"
                    >
                      Browse
                    </button>
                  </div>
                  {pathError && (
                    <p className="text-error text-sm mt-1">{pathError}</p>
                  )}
                  {pathInfo && !pathError && (
                    <p className="text-base-content/60 text-sm mt-1 font-mono">
                      {pathInfo.expandedPath}
                    </p>
                  )}
                </div>

                {/* Project Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-awesome-project"
                    className="input input-bordered w-full"
                  />
                </div>

                {/* Branch and Language */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Default Branch</label>
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="input input-bordered w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Primary Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as typeof language)}
                      className="select select-bordered w-full"
                    >
                      <option value="nodejs">Node.js / TypeScript</option>
                      <option value="python">Python</option>
                      <option value="dotnet">.NET / C#</option>
                      <option value="go">Go</option>
                    </select>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => setShowNewProject(false)}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInitProject}
                    disabled={!projectPath || !!pathError || !pathInfo?.isDirectory || initProject.isPending}
                    className="btn btn-primary"
                  >
                    {initProject.isPending ? (
                      <>
                        <span className="loading loading-spinner loading-sm" />
                        Initializing...
                      </>
                    ) : (
                      'Initialize Project'
                    )}
                  </button>
                </div>

                {initProject.isError && (
                  <div className="alert alert-error mt-4">
                    <span>Failed to initialize project: {(initProject.error as Error)?.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="divider text-base-content/40 mb-8">
          <span className="px-4">Your Projects</span>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-base-content/60">
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <button
                key={project.path}
                onClick={() => handleSelectProject(project)}
                className="bg-base-200 rounded-xl border border-base-300 overflow-hidden hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 text-left group"
              >
                {/* Project stats overview */}
                <div className="h-32 bg-gradient-to-br from-base-200 to-base-300 p-4 flex items-center justify-around">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{project.specCount ?? 0}</div>
                    <div className="text-xs text-base-content/60">Specs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-warning">{project.activeSpec ? 1 : 0}</div>
                    <div className="text-xs text-base-content/60">Active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-success">{project.ralphStatus?.completedTasks ?? 0}</div>
                    <div className="text-xs text-base-content/60">Done</div>
                  </div>
                </div>

                {/* Project Info */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(project.status)}
                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                      {project.name}
                    </h3>
                  </div>
                  <p className="text-sm text-base-content/60 font-mono truncate mb-3">
                    {project.path}
                  </p>
                  <div className="flex items-center justify-between text-xs text-base-content/50">
                    <span className={getStatusColor(project.status)}>
                      {project.status === 'running' ? 'Running' : project.status === 'error' ? 'Error' : 'Idle'}
                    </span>
                    <span>{formatLastActivity(project.lastActivity)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Folder Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-base-200 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-base-300">
              <h3 className="font-semibold">Select Project Directory</h3>
              <button
                onClick={() => setShowBrowser(false)}
                className="btn btn-ghost btn-sm btn-circle"
              >
                ✕
              </button>
            </div>

            {/* Current Path */}
            <div className="px-4 py-2 bg-base-300 font-mono text-sm flex items-center gap-2">
              <span className="text-base-content/60">Path:</span>
              <span className="truncate">{browserPath}</span>
            </div>

            {/* Directory List */}
            <div className="flex-1 overflow-y-auto p-2">
              {browserLoading ? (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner" />
                </div>
              ) : (
                <>
                  {/* Parent Directory */}
                  {browserData?.parentPath && (
                    <button
                      onClick={() => handleBrowserNavigate(browserData.parentPath!)}
                      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-base-300 transition-colors"
                    >
                      <span className="text-xl">📁</span>
                      <span className="font-medium">..</span>
                      <span className="text-sm text-base-content/60 ml-auto">Parent directory</span>
                    </button>
                  )}

                  {/* Directories */}
                  {browserData?.directories.map((dir) => (
                    <div key={dir.path} className="flex items-center">
                      <button
                        onClick={() => dir.hasSubdirs ? handleBrowserNavigate(dir.path) : handleBrowserSelect(dir)}
                        className="flex items-center gap-3 flex-1 p-3 rounded-lg hover:bg-base-300 transition-colors"
                      >
                        <span className="text-xl">
                          {dir.isSpekiProject ? '📋' : '📁'}
                        </span>
                        <span className={`font-medium ${dir.isSpekiProject ? 'text-warning' : ''}`}>
                          {dir.name}
                        </span>
                        {dir.isSpekiProject && (
                          <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded">
                            Already initialized
                          </span>
                        )}
                        {dir.hasSubdirs && !dir.isSpekiProject && (
                          <span className="text-base-content/40 ml-auto">▸</span>
                        )}
                      </button>
                      {!dir.isSpekiProject && (
                        <button
                          onClick={() => handleBrowserSelect(dir)}
                          className="btn btn-primary btn-sm mr-2"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  ))}

                  {browserData?.directories.length === 0 && (
                    <div className="text-center py-8 text-base-content/60">
                      No subdirectories found
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-base-300 flex justify-between items-center">
              <button
                onClick={() => handleBrowserSelect({ name: '', path: browserPath, hasSubdirs: false, isSpekiProject: false })}
                className="btn btn-primary"
              >
                Select Current Directory
              </button>
              <button
                onClick={() => setShowBrowser(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
