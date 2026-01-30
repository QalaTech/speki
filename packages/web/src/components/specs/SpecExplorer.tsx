/**
 * SpecExplorer - Main component for browsing and editing spec files.
 *
 * Redesigned as a single progressive view:
 * - Editor always visible at top
 * - Generated artifacts (stories/tasks) shown below as collapsible sections
 * - Stepper shows Write → Plan → Execute progression
 * - AI Review available as side panel at any point (optional)
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SpecTree } from './SpecTree';
import { SpecHeader } from './SpecHeader';
import { type SpecEditorRef } from '../shared/SpecEditor';
import { SpecDecomposeTab } from './SpecDecomposeTab';
import { DiffOverlay } from './DiffOverlay';
import { ReviewChat } from '../review/ReviewChat';
import { CreateTechSpecModal } from './CreateTechSpecModal';
import { SpecExplorerPreviewTab } from './SpecExplorerPreviewTab';
import { ReviewPanel } from './ReviewPanel';
import { NewSpecDrawer } from './NewSpecDrawer';
import type { WorkflowPhase } from './SpecStepper';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  RocketLaunchIcon,
  SparklesIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Drawer, DrawerContent } from "../ui/Drawer";
import { SpecContentSkeleton } from '../shared/SpecSkeleton';

// Hooks
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { useSpecFileTree } from '../../hooks/useSpecFileTree';
import { useSpecContent } from '../../hooks/useSpecContent';
import { useSpecReview } from '../../hooks/useSpecReview';
import { useSpecChat } from '../../hooks/useSpecChat';
import { useSpecCreation } from '../../hooks/useSpecCreation';
import { apiFetch } from '../ui/ErrorContext';

// Types
import { getSpecTypeFromFilename } from './types';

interface SpecExplorerProps {
  projectPath: string;
}


export function SpecExplorer({ projectPath }: SpecExplorerProps) {
  // URL state management
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

  // Review panel drawer state
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(true);

  // Plan section collapsed state
  const [isPlanSectionOpen, setIsPlanSectionOpen] = useState(true);
  // Show decompose tab inline (triggered from sticky CTA when no tasks exist yet)
  const [showDecomposeInline, setShowDecomposeInline] = useState(false);
  const [isGeneratingFromCta, setIsGeneratingFromCta] = useState(false);

  // Resizable panel
  const { width: treeWidth, handleResizeStart } = useResizablePanel({
    storageKey: 'specExplorerTreeWidth',
    defaultWidth: 260,
    minWidth: 180,
    maxWidth: 500,
  });

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
    isEditing,
    setIsEditing,
    handleContentChange,
    handleSave,
    refetchContent,
    revertChanges,
  } = useSpecContent({
    projectPath,
    selectedPath,
  });

  // Review workflow
  const {
    session,
    setSession,
    isStartingReview,
    selectedTagFilters,
    setSelectedTagFilters,
    diffOverlay,
    setDiffOverlay,
    getReviewStatus,
    handleStartReview,
    handleDiffApprove,
    handleDiffReject,
    handleSuggestionAction,
  } = useSpecReview({
    projectPath,
    selectedPath,
    content,
    onContentChange: setContent,
    onSave: handleSave,
  });

  // Chat
  const {
    isChatOpen,
    setIsChatOpen,
    isSendingChat,
    discussingContext,
    setDiscussingContext,
    setDiscussStartTimestamp,
    handleSendChatMessage,
    handleDiscussSuggestion,
    handleNewChat,
    filteredChatMessages,
  } = useSpecChat({
    projectPath,
    selectedPath,
    session,
    setSession,
    onContentRefetch: refetchContent,
  });

  // Spec creation
  const {
    isNewSpecModalOpen,
    newSpecName,
    setNewSpecName,
    newSpecType,
    setNewSpecType,
    isCreatingSpec,
    handleOpenNewSpecModal,
    handleCreateNewSpec,
    handleCancelNewSpec,
    isCreateTechSpecModalOpen,
    prdUserStories,
    handleOpenCreateTechSpec,
    handleTechSpecCreated,
    handleCloseTechSpecModal,
    handleQuickExecute,
  } = useSpecCreation({
    projectPath,
    selectedPath,
    onFilesRefresh: refreshFiles,
    onSelectPath: setSelectedPath,
    onGenerationEnd: () => {
      setIsGeneratingTechSpec(false);
      setGeneratingTechSpecInfo(null);
    },
  });

  // Handler for asking about selected text in the editor
  const handleSelectionAsk = useCallback((selectedText: string, question: string) => {
    setDiscussStartTimestamp(new Date().toISOString());
    setIsChatOpen(true);
    const messageWithContext = `Regarding this text from the spec:\n\n> ${selectedText}\n\n${question}`;
    handleSendChatMessage(messageWithContext, selectedText);
  }, [setDiscussStartTimestamp, setIsChatOpen, handleSendChatMessage]);

  const isSendingChatRef = useRef(isSendingChat);
  isSendingChatRef.current = isSendingChat;

  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;

  const handleChatDrawerOpenChange = useCallback((open: boolean) => {
    if (open === isChatOpenRef.current) return;
    if (!open && isSendingChatRef.current) return;
    setIsChatOpen(open);
  }, [setIsChatOpen]);

  // Reset state when project or spec changes
  useEffect(() => {
    setIsChatOpen(false);
    setDiscussingContext(null);
    setShowDecomposeInline(false);
  }, [projectPath, selectedPath, setIsChatOpen, setDiscussingContext]);

  // Track decompose state for selected PRD
  const [decomposeStoryCount, setDecomposeStoryCount] = useState(0);

  // Derived values
  const selectedFileName = selectedPath?.split('/').pop() || '';
  const selectedSpecType = getSpecTypeFromFilename(selectedFileName);

  // Fetch decompose story/task count for the selected spec
  const fetchDecomposeStoryCount = useCallback(async () => {
    if (!selectedPath) {
      setDecomposeStoryCount(0);
      return;
    }
    try {
      const res = await apiFetch(`/api/decompose/draft?specPath=${encodeURIComponent(selectedPath)}&project=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      setDecomposeStoryCount(data.draft?.userStories?.length || 0);
    } catch {
      setDecomposeStoryCount(0);
    }
  }, [selectedPath, projectPath]);

  useEffect(() => {
    fetchDecomposeStoryCount();
  }, [fetchDecomposeStoryCount]);

  const prdProgress = selectedSpecType === 'prd' && decomposeStoryCount > 0
    ? { completed: 0, total: decomposeStoryCount }
    : undefined;

  // Track execution state for this spec
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSpecCompleted, setIsSpecCompleted] = useState(false);

  // Check queue + spec state for execution phase detection
  useEffect(() => {
    // Reset on every spec change
    setIsExecuting(false);
    setIsSpecCompleted(false);

    if (!selectedPath) return;

    const specId = selectedPath.split('/').pop()?.replace(/\.md$/i, '') || '';
    const params = new URLSearchParams({ project: projectPath });
    let isStale = false;

    // Check queue for active or completed tasks
    apiFetch(`/api/queue/with-tasks?${params}`)
      .then(res => res.json())
      .then(data => {
        if (isStale) return;
        
        const specTasks = (data.queue || []).filter(
          (t: { specId: string }) => t.specId === specId
        );
        if (specTasks.length === 0) return;

        const hasActive = specTasks.some(
          (t: { status: string }) => t.status === 'queued' || t.status === 'running'
        );
        const allCompleted = specTasks.every(
          (t: { status: string }) => t.status === 'completed'
        );
        setIsExecuting(hasActive);
        setIsSpecCompleted(!hasActive && allCompleted);
      })
      .catch(err => console.error('Failed to fetch queue status:', err));

    // Also check decompose draft status for completed specs
    apiFetch(`/api/decompose/draft?specPath=${encodeURIComponent(selectedPath)}&project=${encodeURIComponent(projectPath)}`)
      .then(res => res.json())
      .then(data => {
        if (isStale) return;
        
        if (data.draft?.status === 'completed') {
          setIsSpecCompleted(true);
        }
      })
      .catch(err => console.error('Failed to fetch decompose status:', err));

    return () => { isStale = true; };
  }, [selectedPath, projectPath]);

  // Compute workflow phase
  const currentPhase: WorkflowPhase = useMemo(() => {
    if (isSpecCompleted || isExecuting) return "execute";
    if (decomposeStoryCount > 0) return "plan";
    if (content && content.trim().length > 50) return "write";
    return "write";
  }, [content, decomposeStoryCount, isExecuting, isSpecCompleted]);

  const handleRunQueue = useCallback(() => {
    navigate(`/execution/kanban?project=${encodeURIComponent(projectPath)}`);
  }, [navigate, projectPath]);

  const scrollToPlanContent = useCallback((shouldOpenSection = false) => {
    const doScroll = () => {
      const container = document.getElementById('spec-scroll-container');
      const content = document.getElementById('plan-content');
      if (!container || !content) return;

      const containerRect = container.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      
      const scrollNeeded = contentRect.top - containerRect.top - 100;
      const targetScroll = container.scrollTop + scrollNeeded;
      
      container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    };

    if (shouldOpenSection && !isPlanSectionOpen) {
      setIsPlanSectionOpen(true);
      requestAnimationFrame(() => setTimeout(doScroll, 150));
    } else {
      doScroll();
    }
  }, [isPlanSectionOpen]);

  const handlePhaseClick = useCallback((phase: WorkflowPhase) => {
    if (phase === "plan") {
      scrollToPlanContent(true);
    } else if (phase === "write") {
      const container = document.getElementById('spec-scroll-container');
      container?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [scrollToPlanContent]);

  // Render the main content area
  const renderContent = () => {
    if (isLoadingContent) {
      return <SpecContentSkeleton />;
    }

    if (!selectedPath) {
      if (files.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm text-center p-10 gap-4 max-w-[400px] mx-auto animate-in fade-in zoom-in-95 duration-700">
            <div className="p-5 rounded-3xl bg-linear-to-br from-primary/25 to-secondary/15 shadow-glass animate-bounce-slow">
              <RocketLaunchIcon className="w-14 h-14 text-primary" />
            </div>
            <h2 className="m-0 text-2xl font-semibold text-foreground">Welcome to SPEKI!</h2>
            <p className="m-0 text-sm text-muted-foreground leading-relaxed">
              Create your first spec to start building with iterative AI development.
              Specs define what you want to build - Ralph will help you refine and implement them.
            </p>
            <Button
              variant="primary"
              className="mt-4 rounded-full px-8 h-12 shadow-lg shadow-primary/20"
              onClick={handleOpenNewSpecModal}
            >
              Launch Your First Spec
            </Button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm text-center p-10">
          <p>Select a spec from the tree to view it</p>
        </div>
      );
    }

    const showPlanSection = selectedPath && (decomposeStoryCount > 0 || showDecomposeInline);

    const planHeaderButton = showPlanSection ? (
      <button
        id="plan-section"
        className="flex items-center justify-between w-full px-6 py-3 hover:bg-muted transition-colors bg-card border-t border-border/30"
        onClick={() => scrollToPlanContent(!isPlanSectionOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <SparklesIcon className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">
            {selectedSpecType === 'prd' ? 'User Stories' : 'Tasks'}
          </span>
          {decomposeStoryCount > 0 && (
            <Badge variant="ghost" size="xs">
              {decomposeStoryCount}
            </Badge>
          )}
        </div>
        <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
      </button>
    ) : null;

    // Single scrollable view with editor + plan sections
    return (
      <div className="relative flex flex-col h-full">
        <div id="spec-scroll-container" className="flex flex-col flex-1 overflow-y-auto min-h-0">
          {/* Editor Section */}
          <div id="editor-section" className="flex-shrink-0">
            <SpecExplorerPreviewTab
              content={content}
              isEditing={isEditing}
              onContentChange={handleContentChange}
              editorRef={editorRef}
              onSelectionAsk={handleSelectionAsk}
            />
          </div>

          {/* Plan header - sticky bottom so it pins when scrolled away */}
          {showPlanSection && (
            <div className="sticky bottom-0 z-20 shrink-0 shadow-[0_-6px_16px_rgba(0,0,0,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-500">
              {planHeaderButton}
            </div>
          )}

          {/* Plan content - below the header */}
          {showPlanSection && isPlanSectionOpen && (
            <div id="plan-content" className="shrink-0 border-t border-border/10 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <SpecDecomposeTab
                specPath={selectedPath}
                projectPath={projectPath}
                specType={selectedSpecType}
                onCreateTechSpec={handleOpenCreateTechSpec}
                onQuickExecute={handleQuickExecute}
                isGeneratingTechSpec={isGeneratingTechSpec}
                onDecomposeComplete={fetchDecomposeStoryCount}
                onRunQueue={handleRunQueue}
              />
            </div>
          )}
        </div>

        {/* Sticky bottom CTA - smooth transition out */}
        <div
          className={`shrink-0 border-t border-border/30 bg-card/95 backdrop-blur-sm px-6 shadow-[0_-8px_24px_rgba(0,0,0,0.3)] transition-all duration-500 ease-out overflow-hidden ${
            selectedPath && decomposeStoryCount === 0 && !showDecomposeInline && !isLoadingContent
              ? 'py-4 max-h-24 opacity-100'
              : 'py-0 max-h-0 opacity-0 border-t-transparent'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <SparklesIcon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">
                  {selectedSpecType === 'prd' ? 'Ready to generate user stories' : 'Ready to generate tasks'}
                </span>
                <p className="text-xs text-muted-foreground m-0">
                  {selectedSpecType === 'prd'
                    ? 'Break down this PRD into actionable user stories'
                    : 'Decompose this spec into implementation tasks'}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="rounded-full shadow-lg shadow-primary/20"
              isLoading={isGeneratingFromCta}
              onClick={async () => {
                if (!selectedPath) return;
                setIsGeneratingFromCta(true);
                setIsPlanSectionOpen(true);
                setShowDecomposeInline(true);
                try {
                  const params = new URLSearchParams({ project: projectPath });
                  await apiFetch(`/api/decompose/start?${params}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prdFile: selectedPath, forceRedecompose: false }),
                  });
                  requestAnimationFrame(() => {
                    document.getElementById('plan-section')?.scrollIntoView({ behavior: 'smooth' });
                  });
                } catch {
                  // Decompose tab will show any errors
                } finally {
                  setIsGeneratingFromCta(false);
                }
              }}
            >
              <SparklesIcon className="h-4 w-4" />
              {selectedSpecType === 'prd' ? 'Generate Stories' : 'Generate Tasks'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-card">
        {/* Tree Panel (Left) */}
        <div className="shrink-0 min-w-[180px] max-w-[500px] h-full overflow-hidden" style={{ width: treeWidth }}>
          <SpecTree
            files={files}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onCreateNew={handleOpenNewSpecModal}
            generatingSpec={generatingTechSpecInfo || undefined}
          />
        </div>

        {/* Resize Handle */}
        <div
          className="shrink-0 w-px h-full bg-border/50 cursor-col-resize relative z-10 transition-all duration-200 hover:bg-primary hover:shadow-[0_0_10px_rgba(88,166,255,0.3)] group"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
        </div>

        {/* Document Area (Center) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-card">
          {selectedPath && (
            <SpecHeader
              fileName={selectedFileName}
              filePath={selectedPath}
              reviewStatus={getReviewStatus()}
              hasUnsavedChanges={hasUnsavedChanges}
              isEditMode={isEditing}
              onEditStart={() => setIsEditing(true)}
              onEditCancel={() => {
                setIsEditing(false);
                revertChanges();
              }}
              onSave={handleSave}
              onCreateTechSpec={handleOpenCreateTechSpec}
              isGeneratingTechSpec={isGeneratingTechSpec}
              progress={prdProgress}
              // Workflow stepper props
              currentPhase={currentPhase}
              hasContent={Boolean(content && content.trim().length > 50)}
              hasPlan={decomposeStoryCount > 0}
              isExecuting={isExecuting}
              isCompleted={isSpecCompleted}
              onPhaseClick={handlePhaseClick}
            />
          )}
          <div className="flex-1 overflow-hidden min-h-0">
            {renderContent()}
          </div>
        </div>

        {/* Review Panel (Right) - available regardless of section */}
        {selectedPath && (
          isReviewPanelOpen ? (
            <ReviewPanel
              session={session}
              isStartingReview={isStartingReview}
              selectedTagFilters={selectedTagFilters}
              onTagFilterChange={setSelectedTagFilters}
              onStartReview={handleStartReview}
              onDiscussSuggestion={handleDiscussSuggestion}
              onResolveSuggestion={async (id) => {
                await handleSuggestionAction(id, 'resolved');
                refreshFiles();
              }}
              onDismissSuggestion={async (id) => {
                await handleSuggestionAction(id, 'dismissed');
                refreshFiles();
              }}
              editorRef={editorRef}
              onCollapse={() => setIsReviewPanelOpen(false)}
            />
          ) : (
            /* Collapsed Review Tab */
            <button
              className="flex flex-col items-center justify-center gap-4 w-12 h-full bg-surface border-l border-border hover:bg-surface/80 transition-all duration-500 cursor-pointer group"
              onClick={() => setIsReviewPanelOpen(true)}
              title="Open Review Panel"
            >
              <ChevronLeftIcon className="h-4 w-4 text-muted-foreground/40 group-hover:text-secondary group-hover:-translate-x-0.5 transition-all duration-200" />
              <div className="flex flex-col items-center gap-2">
                <div className="p-2 rounded-lg bg-secondary/10 group-hover:bg-secondary/20 transition-colors ring-1 ring-secondary/20">
                  <MagnifyingGlassIcon className="h-4 w-4 text-secondary" />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-secondary/80 [writing-mode:vertical-rl] rotate-180 tracking-wide transition-colors">
                  Review
                </span>
              </div>
              {session && session.suggestions.filter(s => s.status === 'pending').length > 0 && (
                <Badge variant="secondary" size="xs" className="shadow-sm animate-pulse">
                  {session.suggestions.filter(s => s.status === 'pending').length}
                </Badge>
              )}
            </button>
          )
        )}

        {/* Diff Overlay */}
        {diffOverlay.isOpen && diffOverlay.suggestion && (
          <DiffOverlay
            title={`Reviewing: "${diffOverlay.suggestion.issue}"`}
            originalText={diffOverlay.originalText}
            proposedText={diffOverlay.proposedText}
            onApprove={handleDiffApprove}
            onReject={handleDiffReject}
            onCancel={() => setDiffOverlay({ isOpen: false, suggestion: null, originalText: '', proposedText: '' })}
          />
        )}

        {/* Chat Toggle Button */}
          <div className="fixed bottom-6 right-6 z-50">
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`relative flex items-center justify-center transition-all duration-300 active-press rounded-full ${
                isChatOpen
                  ? 'w-14 h-14 bg-error text-error-foreground shadow-lg'
                  : 'w-20 h-20 bg-card border border-primary/30 shadow-[0_0_25px_rgba(139,92,246,0.4)] hover:shadow-[0_0_35px_rgba(139,92,246,0.6)] hover:scale-105'
              }`}
              title={isChatOpen ? 'Close chat' : 'Open chat'}
            >
              {isChatOpen ? (
                <XMarkIcon className="w-5 h-5" />
              ) : (
                <img src="/in-chat-icon.png" alt="Chat" className="w-16 h-16 object-contain" />
              )}
              {!isChatOpen && (session?.chatMessages?.length ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                  {session?.chatMessages?.length}
                </span>
              )}
            </button>
          </div>

        {/* Chat Drawer */}
        <Drawer
          open={isChatOpen}
          onOpenChange={handleChatDrawerOpenChange}
          direction="right"
        >
          <DrawerContent
            side="right"
            hideOverlay
            className="w-[500px] sm:w-[600px] p-0 border-l border-white/5 bg-background/80 backdrop-blur-xl shadow-2xl h-full mt-0"
            data-testid="review-chat-drawer"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-muted/20 backdrop-blur-md border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                  <ChatBubbleLeftRightIcon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-[14px] font-bold text-foreground tracking-tight font-poppins capitalize">Spec Review Chat</span>
              </div>
              <div className="flex items-center gap-2">
                {filteredChatMessages.length > 0 && (
                  <Button
                    size="sm"
                    className="h-8 px-3 rounded-full text-xs hover:bg-white/5"
                    onClick={handleNewChat}
                  >
                    New session
                  </Button>
                )}
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-white/10 transition-all duration-200"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ReviewChat
                messages={filteredChatMessages}
                sessionId={session?.sessionId}
                discussingContext={discussingContext}
                onSendMessage={handleSendChatMessage}
                onClearDiscussingContext={() => {
                  setDiscussingContext(null);
                  setDiscussStartTimestamp(null);
                }}
                isSending={isSendingChat}
                projectPath={projectPath}
              />
            </div>
          </DrawerContent>
        </Drawer>

        {/* New Spec Drawer */}
        <NewSpecDrawer
          isOpen={isNewSpecModalOpen}
          name={newSpecName}
          type={newSpecType}
          isCreating={isCreatingSpec}
          onNameChange={setNewSpecName}
          onTypeChange={setNewSpecType}
          onCreate={handleCreateNewSpec}
          onClose={handleCancelNewSpec}
        />

        {/* Create Tech Spec Modal */}
        <CreateTechSpecModal
          isOpen={isCreateTechSpecModalOpen}
          onClose={handleCloseTechSpecModal}
          prdSpecId={selectedPath?.replace(/^.*\//, '').replace(/\.md$/, '') || ''}
          prdName={selectedFileName || ''}
          userStories={prdUserStories}
          projectPath={projectPath}
          onCreated={(path) => {
            handleTechSpecCreated(path);
            setSelectedPath(path);
          }}
          onGenerationStart={(specName) => {
            setIsGeneratingTechSpec(true);
            setGeneratingTechSpecInfo({
              parentPath: selectedPath || '',
              name: specName,
            });
          }}
        />
      </div>
  );
}
