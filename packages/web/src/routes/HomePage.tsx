import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useInitProject, type ProjectEntry } from '@features/projects';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Loading';
import { cn } from '../lib/utils';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '../components/ui/Drawer';
import {
  PlusIcon,
  FolderIcon,
  FolderOpenIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  XMarkIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';

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
        return 'text-muted-foreground';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="w-2 h-2 rounded-full bg-success animate-pulse" />;
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-error" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />;
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
    <div className="min-h-screen bg-background">
      <header className="relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-linear-to-b from-primary/5 to-transparent" />
        
        <div className="relative max-w-5xl mx-auto px-6 py-10 flex items-center gap-8">
          <img 
            src="/avatar.png" 
            alt="Speki" 
            className="h-20 w-auto opacity-90" 
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">
              SPEKI
            </h1>
            <p className="text-base text-muted-foreground">
              AI-powered development orchestration
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* New Project Section */}
        <section className="mb-10">
          {!showNewProject ? (
            <button
              onClick={() => setShowNewProject(true)}
              className="w-full group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 transition-all duration-300 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.995]"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                  <PlusIcon className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <span className="block text-base font-semibold text-foreground">
                    New Project
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    Initialize a new SPEKI workspace
                  </span>
                </div>
              </div>
            </button>
          ) : (
            <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-xl shadow-black/5">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Initialize Project</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowNewProject(false)}>
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-5">
                {/* Path Input */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Project Directory
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        value={projectPath}
                        onChange={(e) => setProjectPath(e.target.value)}
                        placeholder="~/projects/my-app"
                        className={`font-mono text-sm pr-10 ${
                          pathError ? 'border-error/50 focus:border-error' : pathInfo?.isDirectory && !pathInfo.isSpekiProject ? 'border-success/50 focus:border-success' : ''
                        }`}
                      />
                      {pathInfo && (
                        <div className="absolute right-3 top-[18px] -translate-y-1/2">
                          {pathInfo.isDirectory && !pathInfo.isSpekiProject ? (
                            <CheckCircleIcon className="h-5 w-5 text-success" />
                          ) : pathError ? (
                            <ExclamationCircleIcon className="h-5 w-5 text-error" />
                          ) : null}
                        </div>
                      )}
                    </div>
                    <Button variant="secondary" onClick={() => setShowBrowser(true)}>
                      Browse
                    </Button>
                  </div>
                  {pathError && (
                    <p className="text-error text-sm mt-1.5">{pathError}</p>
                  )}
                  {pathInfo && !pathError && (
                    <p className="text-muted-foreground text-sm mt-1.5 font-mono opacity-70">
                      {pathInfo.expandedPath}
                    </p>
                  )}
                </div>

                {/* Project Name */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Project Name
                  </label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-project"
                  />
                </div>

                {/* Branch and Language */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Default Branch
                    </label>
                    <Input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Primary Language
                    </label>
                    <Select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as typeof language)}
                    >
                      <option value="nodejs">Node.js / TypeScript</option>
                      <option value="python">Python</option>
                      <option value="dotnet">.NET / C#</option>
                      <option value="go">Go</option>
                    </Select>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border/50">
                  <Button variant="ghost" onClick={() => setShowNewProject(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInitProject}
                    disabled={!projectPath || !!pathError || !pathInfo?.isDirectory || initProject.isPending}
                    isLoading={initProject.isPending}
                  >
                    {!initProject.isPending && <SparklesIcon className="h-4 w-4" />}
                    Initialize
                  </Button>
                </div>

                {initProject.isError && (
                  <Alert variant="error" className="mt-2">
                    Failed to initialize: {(initProject.error as Error)?.message}
                  </Alert>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Projects Section */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Your Projects
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" className="text-primary" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-dashed border-border/30 bg-linear-to-b from-muted/10 to-transparent">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                <RocketLaunchIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Ready to launch?</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                Create your first project and start orchestrating AI-powered development workflows.
              </p>
              <Button
                variant="primary"
                onClick={() => setShowNewProject(true)}
                className="px-6"
              >
                <PlusIcon className="h-4 w-4" />
                Get Started
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => {
                const previewUrl = `${window.location.origin}/execution/kanban?project=${encodeURIComponent(project.path)}`;
                
                return (
                <button
                  key={project.path}
                  onClick={() => handleSelectProject(project)}
                  className="group relative bg-card rounded-xl border border-border/50 overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 active:translate-y-0 text-left"
                >
                  {/* Project Preview - Scaled iframe */}
                  <div className="relative h-32 overflow-hidden border-b border-border/20 bg-background">
                    <iframe
                      src={previewUrl}
                      title={`Preview of ${project.name}`}
                      className="w-[200%] h-[200%] border-none bg-card scale-50 origin-top-left pointer-events-none"
                      sandbox="allow-same-origin allow-scripts"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-card/80 pointer-events-none" />
                  </div>

                  {/* Card Content */}
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusDot(project.status)}
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {project.name}
                      </h3>
                      <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50 ml-auto shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>

                    {/* Path */}
                    <p className="text-xs text-muted-foreground font-mono truncate mb-3 opacity-70">
                      {project.path}
                    </p>

                    {/* Stats Row */}
                    <div className="flex items-center gap-4 mb-3 py-2 border-y border-border/20">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-semibold text-primary">{project.specCount ?? 0}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">Specs</span>
                      </div>
                      <div className="w-px h-4 bg-border/30" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-semibold text-warning">{project.activeSpec ? 1 : 0}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">Active</span>
                      </div>
                      <div className="w-px h-4 bg-border/30" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-semibold text-success">{project.ralphStatus?.completedTasks ?? 0}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">Done</span>
                      </div>
                    </div>

                    {/* Footer - Status and Activity */}
                    <div className="flex items-center justify-between text-xs">
                      <span className={getStatusColor(project.status)}>
                        {project.status === 'running' ? 'Running' : project.status === 'error' ? 'Error' : 'Idle'}
                      </span>
                      <span className="text-muted-foreground/70">
                        {formatLastActivity(project.lastActivity)}
                      </span>
                    </div>
                  </div>
                </button>
              );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Folder Browser Drawer */}
      <Drawer open={showBrowser} onClose={() => setShowBrowser(false)} direction="right">
        <DrawerContent side="right" className="w-full sm:max-w-xl h-full flex flex-col font-poppins">
          <DrawerHeader className="border-b border-border/30 px-6 py-4">
            <DrawerTitle>Select Directory</DrawerTitle>
          </DrawerHeader>

          {/* Current Path */}
          <div className="px-6 py-4 bg-muted/20 border-b border-border/10">
            <p className="font-mono text-xs text-muted-foreground/70 truncate">
              {browserPath}
            </p>
          </div>

          {/* Directory List */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {browserLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner />
              </div>
            ) : (
              <div className="space-y-1">
                {/* Parent Directory */}
                {browserData?.parentPath && (
                  <button
                    onClick={() => handleBrowserNavigate(browserData.parentPath!)}
                    className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-muted/50 transition-all group"
                  >
                    <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <FolderIcon className="h-5 w-5" />
                    </div>
                    <span className="font-medium text-muted-foreground group-hover:text-foreground">..</span>
                  </button>
                )}

                {/* Directories */}
                {browserData?.directories.map((dir) => (
                  <div key={dir.path} className="flex items-center gap-2 group/row">
                    <button
                      onClick={() => dir.hasSubdirs ? handleBrowserNavigate(dir.path) : handleBrowserSelect(dir)}
                      className="flex items-center gap-3 flex-1 p-3 rounded-xl hover:bg-muted/50 transition-all group"
                    >
                      <div className={cn(
                        "p-2 rounded-lg transition-colors shadow-sm",
                        dir.isSpekiProject ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
                      )}>
                        {dir.isSpekiProject ? (
                          <DocumentTextIcon className="h-5 w-5" />
                        ) : (
                          <FolderIcon className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex flex-col items-start min-w-0">
                        <span className={cn(
                          "font-medium truncate",
                          dir.isSpekiProject ? 'text-warning' : 'text-foreground'
                        )}>
                          {dir.name}
                        </span>
                        {dir.isSpekiProject && (
                          <span className="text-[10px] font-bold text-warning tracking-wider uppercase">
                            Speki Project
                          </span>
                        )}
                      </div>
                      {dir.hasSubdirs && !dir.isSpekiProject && (
                        <ChevronRightIcon className="h-4 w-4 text-muted-foreground/30 ml-auto group-hover:translate-x-0.5 transition-transform" />
                      )}
                    </button>
                    {!dir.isSpekiProject && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleBrowserSelect(dir)}
                        className="text-primary hover:bg-primary/10 rounded-lg transition-all"
                      >
                        Select
                      </Button>
                    )}
                  </div>
                ))}

                {browserData?.directories.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in zoom-in duration-300">
                    <div className="p-4 rounded-full bg-muted/30 mb-4">
                      <FolderOpenIcon className="h-8 w-8 opacity-20" />
                    </div>
                    <p className="text-sm font-medium">No subdirectories</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <DrawerFooter className="p-6 border-t border-border/30 bg-muted/5 backdrop-blur-xl">
            <Button
              variant="primary"
              onClick={() => handleBrowserSelect({ name: '', path: browserPath, hasSubdirs: false, isSpekiProject: false })}
              className="flex-1 h-11 rounded-xl font-semibold shadow-lg shadow-primary/20"
            >
              Select Current Directory
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setShowBrowser(false)}
              className="px-6 h-11 rounded-xl text-muted-foreground hover:bg-muted/50"
            >
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
