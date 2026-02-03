/**
 * SpecWorkplace - Codex-style agentic UI for spec editing
 * 
 * Phase 2: Full functionality
 * - Sidebar with spec tree
 * - Codex-style floating chat input
 * - MDX editor with last saved indicator
 * - Expandable tasks with UseCaseList
 * - Generate/Regenerate buttons
 * - Add to queue functionality
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  PaperAirplaneIcon, 
  XMarkIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  QueueListIcon,
  PlusIcon,
  DocumentPlusIcon,
} from '@heroicons/react/24/outline';

// Components
import { AppSidebar } from '../components/specs/AppSidebar';
import { SidebarProvider, SidebarInset } from '../components/ui/sidebar';
import { SpecEditor, type SpecEditorRef } from '../components/shared/SpecEditor';
import { UseCaseList } from '../components/specs/UseCaseList';
import { Button } from '../components/ui/Button';
import { CreateTechSpecModal } from '../components/specs/CreateTechSpecModal';
import { NewSpecDrawer } from '../components/specs/NewSpecDrawer';

// Hooks
import { useSpecFileTree } from '../hooks/useSpecFileTree';
import { useSpecContent } from '../hooks/useSpecContent';
import { useDecomposeSSE } from '../hooks/useDecomposeSSE';
import { apiFetch } from '../components/ui/ErrorContext';

// Types
import { getSpecTypeFromFilename } from '../components/specs/types';
import type { UserStory, QueuedTaskReference } from '../types';
import { CrossIcon, XIcon } from 'lucide-react';

interface SpecWorkplaceProps {
  projectPath: string;
}

// Mock data types for suggestions
interface Suggestion {
  id: string;
  originalText: string;
  suggestedText: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Mock suggestions data
const MOCK_SUGGESTIONS: Suggestion[] = [
  {
    id: '1',
    originalText: 'The CLI should ask for a location',
    suggestedText: 'The CLI should prompt the user to enter a location name or coordinates',
    reason: 'More specific about what input format is expected',
    status: 'pending',
  },
  {
    id: '2',
    originalText: 'Find a free api to use',
    suggestedText: 'Use the OpenWeatherMap free tier API (up to 1000 calls/day)',
    reason: 'Provides a concrete recommendation with rate limit info',
    status: 'pending',
  },
];

// Helper to format relative time
function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function SpecWorkplace({ projectPath }: SpecWorkplaceProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPath = searchParams.get('spec');

  const setSelectedPath = useCallback((path: string | null) => {
    setSearchParams(prev => {
      if (path) {
        prev.set('spec', path);
      } else {
        prev.delete('spec');
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const editorRef = useRef<SpecEditorRef>(null);

  // File tree
  const {
    files,
    isGeneratingTechSpec,
    generatingTechSpecInfo,
    setIsGeneratingTechSpec,
    setGeneratingTechSpecInfo,
    refreshFiles,
  } = useSpecFileTree({
    projectPath,
    onAutoSelectFile: (path) => {
      if (!selectedPath) setSelectedPath(path);
    },
  });

  // Content management
  const {
    content,
    setContent,
    isLoading: isLoadingContent,
    hasUnsavedChanges,
    handleContentChange,
    handleSave,
  } = useSpecContent({
    projectPath,
    selectedPath,
  });

  // Last saved tracking
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [, setForceUpdate] = useState(0);

  // Update relative time display
  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => setForceUpdate(x => x + 1), 10000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // Auto-save with debounce
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await handleSave();
        setLastSavedAt(new Date());
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [content, hasUnsavedChanges, handleSave]);

  // Decompose state
  const [stories, setStories] = useState<UserStory[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [queueTasks, setQueueTasks] = useState<QueuedTaskReference[]>([]);
  const [queueLoading, setQueueLoading] = useState<Set<string>>(new Set());

  // Decompose SSE
  const decomposeState = useDecomposeSSE(projectPath);

  // Derived values
  const selectedFileName = selectedPath?.split('/').pop() || '';
  const selectedSpecType = getSpecTypeFromFilename(selectedFileName);
  const specId = selectedPath?.split('/').pop()?.replace(/\.md$/i, '') || '';
  const hasStories = stories.length > 0;
  const isPrd = selectedSpecType === 'prd';

  // Extract title from document content (first H1) or format filename
  const documentTitle = useMemo(() => {
    // Try to extract H1 from content
    if (content) {
      const h1Match = content.match(/^#\s+(.+)$/m);
      if (h1Match) {
        return h1Match[1].trim();
      }
    }
    // Fall back to formatted filename
    if (selectedFileName) {
      // Remove extension and timestamp pattern (YYYYMMDD-HHMMSS-)
      const cleanName = selectedFileName
        .replace(/\.(prd|tech|bug)\.md$/i, '')
        .replace(/^\d{8}-\d{6}-/, ''); // Remove timestamp prefix
      // Convert to title case
      return cleanName
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    return 'Untitled';
  }, [content, selectedFileName]);

  // Load decompose state
  const loadDecomposeState = useCallback(async () => {
    if (!selectedPath) return;
    try {
      const params = new URLSearchParams({ specPath: selectedPath, project: projectPath });
      const res = await apiFetch(`/api/decompose/draft?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          setStories(data.draft.userStories || []);
        }
      }
    } catch (err) {
      console.error('Failed to load decompose state:', err);
    }
  }, [selectedPath, projectPath]);

  // Load queue tasks
  const loadQueueTasks = useCallback(async () => {
    if (!specId) return;
    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/queue/with-tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        const allTasks = data.queue || [];
        const specTasks = allTasks.filter((t: QueuedTaskReference) => t.specId === specId);
        setQueueTasks(specTasks);

        const completed = new Set<string>(
          specTasks
            .filter((t: QueuedTaskReference) => t.status === 'completed')
            .map((t: QueuedTaskReference) => t.taskId)
        );
        setCompletedIds(completed);
      }
    } catch (err) {
      console.error('Failed to load queue tasks:', err);
    }
  }, [specId, projectPath]);

  // Load on spec change
  useEffect(() => {
    if (selectedPath) {
      loadDecomposeState();
      loadQueueTasks();
    } else {
      setStories([]);
      setQueueTasks([]);
    }
  }, [selectedPath, loadDecomposeState, loadQueueTasks]);

  // Listen to SSE updates
  useEffect(() => {
    if (!decomposeState || !selectedPath) return;
    
    const isForThisSpec = 
      decomposeState.prdFile === selectedPath ||
      decomposeState.prdFile?.endsWith(selectedPath) ||
      selectedPath.endsWith(decomposeState.prdFile || '');
    
    if (!isForThisSpec) return;

    const activeStatuses = ['STARTING', 'INITIALIZING', 'DECOMPOSING', 'REVIEWING', 'REVISING'];
    if (activeStatuses.includes(decomposeState.status)) {
      setIsDecomposing(true);
    } else if (decomposeState.status === 'COMPLETED' || decomposeState.status === 'DECOMPOSED') {
      setIsDecomposing(false);
      loadDecomposeState();
    }
  }, [decomposeState, selectedPath, loadDecomposeState]);

  // Decompose handlers
  const handleDecompose = useCallback(async (force: boolean = false) => {
    if (!selectedPath) return;
    setIsDecomposing(true);
    try {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/decompose/start?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prdFile: selectedPath, forceRedecompose: force }),
      });
    } catch (err) {
      console.error('Decompose failed:', err);
      setIsDecomposing(false);
    }
  }, [selectedPath, projectPath]);

  // Queue handlers
  const isTaskQueued = (taskId: string) => queueTasks.some(t => t.taskId === taskId);
  const getQueuePosition = (taskId: string) => {
    const pending = queueTasks.filter(t => t.status === 'queued' || t.status === 'running');
    const idx = pending.findIndex(t => t.taskId === taskId);
    return idx >= 0 ? idx + 1 : null;
  };
  const getQueuedTaskStatus = (taskId: string) => queueTasks.find(t => t.taskId === taskId)?.status || 'pending';

  const handleAddToQueue = useCallback(async (taskId: string) => {
    if (!specId) return;
    setQueueLoading(prev => new Set(prev).add(taskId));
    try {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/queue/add?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, taskId }),
      });
      await loadQueueTasks();
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [specId, projectPath, loadQueueTasks]);

  const handleRemoveFromQueue = useCallback(async (taskId: string) => {
    if (!specId) return;
    setQueueLoading(prev => new Set(prev).add(taskId));
    try {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/queue/${specId}/${taskId}?${params}`, { method: 'DELETE' });
      await loadQueueTasks();
    } finally {
      setQueueLoading(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [specId, projectPath, loadQueueTasks]);

  const handleAddAllToQueue = useCallback(async () => {
    const tasksToAdd = stories.filter(s => !s.passes && !isTaskQueued(s.id));
    for (const task of tasksToAdd) {
      await handleAddToQueue(task.id);
    }
  }, [stories, handleAddToQueue]);

  const handleSaveTask = useCallback(async (task: UserStory, content: string) => {
    const params = new URLSearchParams({ project: projectPath });
    await apiFetch(`/api/decompose/update-task?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specId, task: { ...task, content } }),
    });
    await loadDecomposeState();
  }, [specId, projectPath, loadDecomposeState]);

  const handleRunQueue = useCallback(() => {
    navigate(`/execution/kanban?project=${encodeURIComponent(projectPath)}`);
  }, [navigate, projectPath]);

  // New spec creation
  const [isNewSpecModalOpen, setIsNewSpecModalOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecType, setNewSpecType] = useState<'prd' | 'tech-spec' | 'bug'>('prd');
  const [isCreatingSpec, setIsCreatingSpec] = useState(false);

  const handleCreateNewSpec = useCallback(async () => {
    if (!newSpecName.trim()) return;
    setIsCreatingSpec(true);
    try {
      const params = new URLSearchParams({ project: projectPath });
      const res = await apiFetch(`/api/specs?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSpecName, type: newSpecType }),
      });
      if (res.ok) {
        const data = await res.json();
        refreshFiles();
        setSelectedPath(data.path);
        setIsNewSpecModalOpen(false);
        setNewSpecName('');
      }
    } finally {
      setIsCreatingSpec(false);
    }
  }, [newSpecName, newSpecType, projectPath, refreshFiles, setSelectedPath]);

  // Tech spec modal
  const [isCreateTechSpecModalOpen, setIsCreateTechSpecModalOpen] = useState(false);

  const handleTechSpecCreated = useCallback((path: string) => {
    refreshFiles();
    setSelectedPath(path);
    setIsCreateTechSpecModalOpen(false);
  }, [refreshFiles, setSelectedPath]);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  
  // Suggestions state - initialize with mock data
  const [suggestions, setSuggestions] = useState<Suggestion[]>(MOCK_SUGGESTIONS);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);

  // Text selection state for "Add to conversation" feature
  const [textSelection, setTextSelection] = useState<{
    text: string;
    position: { x: number; y: number };
  } | null>(null);

  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const conversationRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tasksSectionRef = useRef<HTMLDivElement>(null);
  
  // Track if tasks are visible in viewport
  const [tasksVisible, setTasksVisible] = useState(true);

  // Auto-scroll conversation
  useEffect(() => {
    if (conversationRef.current && isConversationOpen) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages, isConversationOpen]);

  // Reset chat on spec change (but keep suggestions for demo)
  useEffect(() => {
    setMessages([]);
    setIsConversationOpen(false);
    setLastSavedAt(null);
    // Reset suggestions to mock data when spec changes
    setSuggestions(MOCK_SUGGESTIONS);
  }, [selectedPath]);

  // Track tasks section visibility using IntersectionObserver
  useEffect(() => {
    if (!tasksSectionRef.current || !scrollContainerRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        setTasksVisible(entry.isIntersecting);
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.1, // Consider visible when 10% is in view
      }
    );
    
    observer.observe(tasksSectionRef.current);
    return () => observer.disconnect();
  }, [hasStories]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsConversationOpen(true);
    setIsSendingChat(true);

    // Simulate AI response (in real impl, call chat API)
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I've reviewed your spec. Everything looks good! Let me know if you'd like any suggestions for improvements.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsSendingChat(false);
    }, 1500);
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    // Cmd/Ctrl + Enter also sends
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAcceptSuggestion = (id: string) => {
    setSuggestions(prev => prev.map(s => 
      s.id === id ? { ...s, status: 'accepted' as const } : s
    ));
    setSelectedSuggestion(null);
  };

  const handleRejectSuggestion = (id: string) => {
    setSuggestions(prev => prev.map(s => 
      s.id === id ? { ...s, status: 'rejected' as const } : s
    ));
    setSelectedSuggestion(null);
  };

  return (
    <SidebarProvider>
      <AppSidebar
        files={files}
        selectedPath={selectedPath}
        onSelect={setSelectedPath}
        onCreateNew={() => setIsNewSpecModalOpen(true)}
        generatingSpec={generatingTechSpecInfo || undefined}
      />
      <SidebarInset className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Scrollable content area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto px-6 py-8 pb-4">
            {selectedPath ? (
              <>
                {/* Header - Redesigned for prominence */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    {/* Title and badge group */}
                    <div className="flex flex-col">
                      <h1 className="text-xl font-semibold text-foreground tracking-tight">
                        {documentTitle}
                      </h1>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md ${
                          selectedSpecType === 'prd' 
                            ? 'bg-info/15 text-info' 
                            : selectedSpecType === 'tech-spec'
                            ? 'bg-primary/15 text-primary'
                            : 'bg-error/15 text-error'
                        }`}>
                          {selectedSpecType?.toUpperCase() || 'SPEC'}
                        </span>
                        {/* Stories badge inline */}
                        {hasStories && (
                          <button
                            onClick={() => document.getElementById('tasks-section')?.scrollIntoView({ behavior: 'smooth' })}
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <SparklesIcon className="w-3 h-3" />
                            <span>{stories.length} {isPrd ? 'stories' : 'tasks'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Right side - save status */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    {isSaving ? (
                      <span className="flex items-center gap-1.5 text-primary">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        Saving...
                      </span>
                    ) : lastSavedAt ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-success/60" />
                        Saved {formatRelativeTime(lastSavedAt)}
                      </span>
                    ) : hasUnsavedChanges ? (
                      <span className="flex items-center gap-1.5 text-warning">
                        <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                        Unsaved
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Document Editor */}
                <div className="mb-8">
                <div 
                  ref={editorContainerRef}
                  className="bg-card/50 border border-white/3 rounded-xl overflow-hidden relative shadow-lg"
                  onMouseUp={() => {
                    const selection = window.getSelection();
                    const selectedText = selection?.toString().trim();
                    if (selectedText && selectedText.length > 0) {
                      const range = selection?.getRangeAt(0);
                      const rect = range?.getBoundingClientRect();
                      if (rect && editorContainerRef.current) {
                        const containerRect = editorContainerRef.current.getBoundingClientRect();
                        setTextSelection({
                          text: selectedText,
                          position: {
                            x: rect.left + rect.width / 2 - containerRect.left,
                            y: rect.top - containerRect.top - 8,
                          },
                        });
                      }
                    } else {
                      setTextSelection(null);
                    }
                  }}
                >
                  {/* Text selection popup */}
                  {textSelection && (
                    <div
                      className="absolute z-50 -translate-x-1/2 -translate-y-full"
                      style={{ left: textSelection.position.x, top: textSelection.position.y }}
                    >
                      <button
                        onClick={() => {
                          setInputValue(prev => 
                            prev + (prev ? '\n\n' : '') + `Regarding: "${textSelection.text}"`
                          );
                          setTextSelection(null);
                          window.getSelection()?.removeAllRanges();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors whitespace-nowrap flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Add to conversation
                      </button>
                    </div>
                  )}
                  
                  {isLoadingContent ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <SpecEditor
                      ref={editorRef}
                      content={content}
                      onChange={handleContentChange}
                      readOnly={false}
                      className="min-h-[300px]"
                    />
                  )}
                </div>
                </div>

                {/* Tasks Section - prose-style like SpecExplorer */}
                <div ref={tasksSectionRef} id="tasks-section" className="mb-8 scroll-mt-8">
                  {/* Header styled like prose h2 */}
                  <div className="flex items-baseline gap-3 mb-3 pb-[0.5em] border-b border-border/70">
                    <h2 className="m-0 text-[1.5em] font-semibold font-[Poppins,system-ui,sans-serif] tracking-[-0.02em] leading-tight" style={{ color: '#7AB0F9' }}>
                      {isPrd ? 'User Stories' : 'Tasks'}
                    </h2>
                    {hasStories && (
                      <span className="text-muted-foreground text-sm">
                        {completedIds.size}/{stories.length}
                      </span>
                    )}
                    {/* Loading indicator when fetching stories */}
                    {isLoadingContent && !hasStories && (
                      <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
                    )}
                    <div className="flex-1" />
                    
                    {/* Action buttons */}
                    {isDecomposing ? (
                      <div className="flex items-center gap-2 text-primary text-xs h-6 px-2">
                        <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span>Generating...</span>
                      </div>
                    ) : hasStories ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDecompose(true)}
                          className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
                        >
                          <ArrowPathIcon className="h-3 w-3 mr-1" />
                          Regenerate
                        </Button>
                        {selectedSpecType === 'tech-spec' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleAddAllToQueue}
                              disabled={stories.every(s => s.passes || isTaskQueued(s.id))}
                              className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <QueueListIcon className="h-3.5 w-3.5 mr-1" />
                              Queue All
                            </Button>
                            {queueTasks.some(t => t.status === 'queued') && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={handleRunQueue}
                                className="h-7 text-xs"
                              >
                                Run Queue
                              </Button>
                            )}
                          </>
                        )}
                        {isPrd && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsCreateTechSpecModalOpen(true)}
                            disabled={isGeneratingTechSpec}
                            className="h-7 text-xs text-primary"
                          >
                            <DocumentPlusIcon className="h-3.5 w-3.5 mr-1" />
                            Generate Tech Spec
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDecompose(false)}
                        className="h-7 text-xs text-primary"
                      >
                        <SparklesIcon className="h-3.5 w-3.5 mr-1" />
                        Generate {isPrd ? 'Stories' : 'Tasks'}
                      </Button>
                    )}
                  </div>

                  {/* Task list */}
                  {hasStories ? (
                    <UseCaseList
                      stories={stories}
                      completedIds={completedIds}
                      specType={selectedSpecType as 'prd' | 'tech-spec' | 'bug'}
                      isQueued={isTaskQueued}
                      getQueuePosition={getQueuePosition}
                      getQueuedTaskStatus={getQueuedTaskStatus}
                      onAddToQueue={handleAddToQueue}
                      onRemoveFromQueue={handleRemoveFromQueue}
                      queueLoading={queueLoading}
                      onSaveTask={handleSaveTask}
                    />
                  ) : !isDecomposing ? (
                    <p className="text-muted-foreground text-sm italic py-4">
                      No {isPrd ? 'user stories' : 'tasks'} yet. Click Generate to create them.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <div className="p-4 rounded-2xl bg-primary/10 mb-4">
                  <SparklesIcon className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Select a spec</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Choose a spec from the sidebar to start editing, or create a new one.
                </p>
                <Button
                  variant="primary"
                  className="mt-6"
                  onClick={() => setIsNewSpecModalOpen(true)}
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  New Spec
                </Button>
              </div>
            )}
          </div>
        </div>


        {/* Floating Chat Area - seamless blend like Codex */}
        {selectedPath && (
          <div className="shrink-0 relative">
            {/* Gradient fade from content to chat area */}
            <div className="absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            
            {/* Visual backdrop overlay for conversation or suggestions - allows scroll through */}
            {(isConversationOpen || isSuggestionsExpanded) && (
              <div 
                className="fixed inset-0 bg-black/20 z-30 pointer-events-none"
              />
            )}
            
            <div className="max-w-5xl mx-auto px-6 py-4 relative z-40">
              {/* Conversation Popover */}
              {isConversationOpen && messages.length > 0 && !isSuggestionsExpanded && (
                <div 
                  ref={conversationRef}
                  className="absolute bottom-full left-0 right-0 mb-2 max-h-80 overflow-y-auto rounded-lg bg-[#1e1e1e] border border-white/5 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="sticky top-0 flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#1e1e1e] z-10">
                    <span className="text-xs font-medium text-muted-foreground">Conversation</span>
                    <button 
                      onClick={() => setIsConversationOpen(false)}
                      className="p-1 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="p-4 space-y-4">
                    {messages.map(msg => (
                      <div key={msg.id} className={msg.role === 'user' ? 'text-right' : ''}>
                        {msg.role === 'user' ? (
                          // User message - speech bubble on right
                          <div className="inline-block max-w-[85%] bg-[#2a2a2a] rounded-2xl rounded-br-md px-4 py-2.5 text-left">
                            <p className="text-sm text-foreground">{msg.content}</p>
                          </div>
                        ) : (
                          // AI response - styled text, no bubble
                          <div className="text-sm text-foreground/90 leading-relaxed">
                            <p>{msg.content}</p>
                          </div>
                        )}
                      </div>
                    ))}
                    {isSendingChat && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Unified Status Bar - shows both tasks and suggestions indicators */}
              {(pendingSuggestions.length > 0 || (hasStories && !tasksVisible)) && (
                <div className="relative mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {/* Collapsed unified bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-[#1e1e1e] border border-white/3 transition-all duration-200">
                    {/* Left: Tasks indicator */}
                    <div className="flex items-center gap-3">
                      {hasStories && !tasksVisible && (
                        <button
                          onClick={() => document.getElementById('tasks-section')?.scrollIntoView({ behavior: 'smooth' })}
                          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronDownIcon className="w-4 h-4" />
                          <span>{stories.length} {isPrd ? 'stories' : 'tasks'} below</span>
                        </button>
                      )}
                    </div>
                    
                    {/* Right: Suggestions */}
                    {pendingSuggestions.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsSuggestionsExpanded(!isSuggestionsExpanded);
                            if (!isSuggestionsExpanded) setIsConversationOpen(false);
                          }}
                          className="flex items-center gap-2 text-sm text-foreground hover:text-foreground/80 transition-colors"
                        >
                          <span>
                            {pendingSuggestions.length} change{pendingSuggestions.length !== 1 ? 's' : ''} suggested
                          </span>
                          {isSuggestionsExpanded 
                            ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                            : <ChevronUpIcon className="w-4 h-4 text-muted-foreground" />
                          }
                        </button>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            pendingSuggestions.forEach(s => handleRejectSuggestion(s.id));
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                        >
                          <XIcon className="w-4 h-4" />
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Expanded suggestions - floats above */}
                  {isSuggestionsExpanded && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-[#1e1e1e] border border-white/3 shadow-2xl overflow-hidden max-h-80 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {pendingSuggestions.map((suggestion) => (
                        <div key={suggestion.id} className="border-b border-white/5 last:border-b-0">
                          {/* Change header */}
                          <div className="flex items-center justify-between px-4 py-2 bg-[#252525]">
                            <span className="text-xs text-muted-foreground font-mono">
                              spec content
                            </span>
                            <span className="text-xs text-success">+1 -1</span>
                          </div>
                          {/* Diff content */}
                          <div className="font-mono text-xs">
                            {/* Removed line */}
                            <div className="flex items-start bg-error/10">
                              <span className="w-10 px-2 py-1 text-right text-error/50 select-none border-r border-white/5">-</span>
                              <span className="flex-1 px-3 py-1 text-error/80 line-through">
                                {suggestion.originalText}
                              </span>
                            </div>
                            {/* Added line */}
                            <div className="flex items-start bg-success/10">
                              <span className="w-10 px-2 py-1 text-right text-success/50 select-none border-r border-white/5">+</span>
                              <span className="flex-1 px-3 py-1 text-success">
                                {suggestion.suggestedText}
                              </span>
                            </div>
                          </div>
                          {/* Reason + actions */}
                          <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a]">
                            <span className="text-xs text-muted-foreground">
                              {suggestion.reason}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleAcceptSuggestion(suggestion.id)}
                                className="px-2 py-1 text-xs rounded bg-success/20 hover:bg-success/30 text-success transition-colors"
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => setSelectedSuggestion(suggestion)}
                                className="px-2 py-1 text-xs rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
                              >
                                Discuss
                              </button>
                              <button
                                onClick={() => handleRejectSuggestion(suggestion.id)}
                                className="px-2 py-1 text-xs rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Codex-style Chat Input */}
              <div className="rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl">
                {/* Textarea - top */}
                <div className="px-4 pt-3 pb-2">
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      if (messages.length > 0) {
                        setIsConversationOpen(true);
                        setIsSuggestionsExpanded(false);
                      }
                    }}
                    placeholder="Ask for follow-up changes"
                    rows={1}
                    className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                    style={{ minHeight: '24px', maxHeight: '120px' }}
                  />
                </div>
                
                {/* Bottom bar - plus, model selector, icons, send */}
                <div className="flex items-center justify-between px-2 py-2 ">
                  {/* Left side - plus button + model selector */}
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                      <PlusIcon className="w-5 h-5" />
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <SparklesIcon className="w-4 h-4" />
                      <span>Claude</span>
                      <ChevronDownIcon className="w-3 h-3" />
                    </button>
                  </div>
                  
                  {/* Right side - icons + send */}
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                      </svg>
                    </button>
                    <button className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim()}
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-1 group relative"
                      title="Send (⌘↵)"
                    >
                      <PaperAirplaneIcon className="w-4 h-4" />
                      {/* Keyboard shortcut hint */}
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] bg-black/80 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        ⌘↵
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Changes Panel */}
        {selectedSuggestion && (
          <>
            <div 
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setSelectedSuggestion(null)}
            />
            <div className="fixed top-0 right-0 h-full w-[480px] bg-card border-l border-white/5 z-50 shadow-2xl animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Review Suggestion</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Accept or reject this change</p>
                </div>
                <button
                  onClick={() => setSelectedSuggestion(null)}
                  className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 space-y-6">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Original</h4>
                  <div className="p-3 rounded-lg bg-error/5 border border-error/10">
                    <p className="text-sm text-foreground/90 line-through">{selectedSuggestion.originalText}</p>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Suggested</h4>
                  <div className="p-3 rounded-lg bg-success/5 border border-success/10">
                    <p className="text-sm text-foreground/90">{selectedSuggestion.suggestedText}</p>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Reason</h4>
                  <p className="text-sm text-muted-foreground">{selectedSuggestion.reason}</p>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => handleAcceptSuggestion(selectedSuggestion.id)}
                    className="flex-1 py-2.5 rounded-lg bg-success/10 hover:bg-success/20 text-success font-medium text-sm transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRejectSuggestion(selectedSuggestion.id)}
                    className="flex-1 py-2.5 rounded-lg bg-error/10 hover:bg-error/20 text-error font-medium text-sm transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </SidebarInset>

      {/* New Spec Drawer */}
      <NewSpecDrawer
        isOpen={isNewSpecModalOpen}
        name={newSpecName}
        type={newSpecType}
        isCreating={isCreatingSpec}
        onNameChange={setNewSpecName}
        onTypeChange={setNewSpecType}
        onCreate={handleCreateNewSpec}
        onClose={() => setIsNewSpecModalOpen(false)}
      />

      {/* Create Tech Spec Modal */}
      <CreateTechSpecModal
        isOpen={isCreateTechSpecModalOpen}
        onClose={() => setIsCreateTechSpecModalOpen(false)}
        prdSpecId={specId}
        prdName={selectedFileName}
        userStories={stories}
        projectPath={projectPath}
        onCreated={handleTechSpecCreated}
        onGenerationStart={(specName) => {
          setIsGeneratingTechSpec(true);
          setGeneratingTechSpecInfo({
            parentPath: selectedPath || '',
            name: specName,
          });
        }}
      />
    </SidebarProvider>
  );
}
