import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

// Components
import { AppSidebar } from '../../components/specs/AppSidebar';
import { SidebarProvider, SidebarInset } from '../../components/ui/sidebar';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { CreateTechSpecModal } from '../../components/specs/CreateTechSpecModal';
import { DiffOverlay } from '../../components/specs/DiffOverlay';
import { NewSpecDrawer } from '../../components/specs/NewSpecDrawer';
import type { SpecEditorRef } from '../../components/shared/SpecEditor';

import { getSpecTypeFromFilename } from '../../components/specs/types';

// Hooks
import { useIsTabletOrSmaller } from '../../hooks/use-mobile';
import { useSpecFileTree } from '../../hooks/useSpecFileTree';
import { useSpecContent } from '../../hooks/useSpecContent';
import { useSpecReview } from '../../hooks/useSpecReview';
import { useSpecChat } from '../../hooks/useSpecChat';
import { apiFetch } from '../../components/ui/ErrorContext';
import {
  useExecutionStatus,
  useExecutionLogs,
  defaultRalphStatus,
  useExecutionTasks,
  useExecutionPeer,
  useQueueTasks,
  executionKeys,
} from '../../features/execution';
import { useStartRalph, useStopRalph } from '../../features/projects';
import {
  useAutoSave,
  useDocumentTitle,
  useCreateSpec,
  useDecompose,
  useQueueManagement,
  useScrollToElement,
} from './hooks';

// Sub-components
import { EditorSection, TasksSection, EmptyState, ChatArea, ExecutionLiveModal, DocumentHeader } from './components';
import { ReviewPanel } from './components/ChatArea/ReviewPanel';

// Contexts
import { useSpec } from '../../contexts/SpecContext';

// Types
import type { UserStory, QueuedTaskWithData } from '../../types';

interface SpecWorkspaceProps {
  projectPath: string;
}

export function SpecWorkspace({ projectPath }: SpecWorkspaceProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPath = searchParams.get('spec');
  const editorRef = useRef<SpecEditorRef>(null);
  const isSmallScreen = useIsTabletOrSmaller();

  // URL management
  const setSelectedPath = useCallback(
    (path: string | null) => {
      setSearchParams(
        (prev) => {
          if (path) {
            prev.set('spec', path);
          } else {
            prev.delete('spec');
          }
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

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
    refetchContent,
  } = useSpecContent({
    projectPath,
    selectedPath,
  });

  // Auto-save
  const { lastSavedAt, isSaving } = useAutoSave({
    content,
    hasUnsavedChanges,
    onSave: handleSave,
    resetKey: selectedPath ?? undefined,
  });

  // Document title extraction
  const selectedFileName = selectedPath?.split('/').pop() || '';
  const selectedSpecType = getSpecTypeFromFilename(selectedFileName);
  const documentTitle = useDocumentTitle({ filename: selectedFileName });

  const { setActiveSpec, setSaveStatus } = useSpec();

  // Sync active spec to context
  useEffect(() => {
    if (selectedPath) {
      setActiveSpec({
        title: documentTitle,
        type: selectedSpecType,
      });
    } else {
      setActiveSpec(null);
    }
  }, [selectedPath, documentTitle, selectedSpecType, setActiveSpec]);

  // Sync save status to context for TopNav display
  useEffect(() => {
    setSaveStatus({ isSaving, lastSavedAt, hasUnsavedChanges });
  }, [isSaving, lastSavedAt, hasUnsavedChanges, setSaveStatus]);

  // Clear active spec on unmount
  useEffect(() => {
    return () => setActiveSpec(null);
  }, [setActiveSpec]);

  // AI Review workflow
  const {
    session,
    setSession,
    isStartingReview,
    diffOverlay,
    setDiffOverlay,
    handleStartReview,
    handleReviewDiff,
    handleDiffApprove,
    handleDiffReject,
    handleSuggestionAction,
    handleBulkSuggestionAction,
  } = useSpecReview({
    projectPath,
    selectedPath,
    content,
    onContentChange: setContent,
    onSave: handleSave,
    onContentRefetch: refetchContent,
    onReviewStatusChanged: refreshFiles,
  });

  // Chat input state - must be before useSpecChat
  const [inputValue, setInputValue] = useState('');
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);
  const previousSelectedPath = useRef<string | null>(selectedPath);
  const hasAutoOpenedReviewPanelForPath = useRef<string | null>(null);

  // Chat functionality
  const {
    isSendingChat,
    handleSendChatMessage,
    handleDiscussSuggestion,
    discussingContext,
    setDiscussingContext,
    filteredChatMessages,
    handleNewChat,
  } = useSpecChat({
    projectPath,
    selectedPath,
    session,
    setSession,
    onContentRefetch: refetchContent,
    setInputValue,
  });

  // Decompose state and operations
  const {
    stories,
    setStories,
    isDecomposing,
    decomposeError,
    setDecomposeError,
    reviewFeedback,
    reviewVerdict,
    specStatus,
    specStatusMessage,
    handleDecompose,
    loadDecomposeState,
  } = useDecompose({
    projectPath,
    selectedPath,
    includeReviewMeta: true,
  });

  // Queue management - uses React Query with automatic polling when running
  const specId = selectedPath?.split('/').pop()?.replace(/\.md$/i, '') || '';
  const {
    queueTasks,
    allQueueTasks,
    setQueueTasks,
    queueLoading,
    completedIds: baseCompletedIds,
    loadQueueTasks,
    addToQueue,
    removeFromQueue,
    getQueuedTaskStatus: baseGetQueuedTaskStatus,
  } = useQueueManagement({
    specId,
    projectPath,
  });

  // Execution state - controlled via query string
  const isExecutionModalOpen = searchParams.get('liveViewOpen') === 'true';
  const setIsExecutionModalOpen = useCallback((open: boolean) => {
    setSearchParams(prev => {
      if (open) {
        prev.set('liveViewOpen', 'true');
      } else {
        prev.delete('liveViewOpen');
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);
  const { data: ralphStatus } = useExecutionStatus(projectPath);
  const { data: executionLogs } = useExecutionLogs(projectPath);
  const { data: prdData } = useExecutionTasks(projectPath);

  // Use queue query for live updates - polls automatically when running
  const {
    data: liveQueueTasks,
    isFetched: isLiveQueueFetched,
    refetch: refetchLiveQueueTasks,
  } = useQueueTasks(projectPath, ralphStatus?.running);
  const executionQueueTasks = useMemo(() => {
    if (!isLiveQueueFetched) {
      return allQueueTasks;
    }
    return liveQueueTasks || allQueueTasks;
  }, [allQueueTasks, isLiveQueueFetched, liveQueueTasks]);
  const liveCompletedIds = useMemo(() => {
    return new Set(
      (executionQueueTasks || [])
        .filter((t) => t.status === 'completed')
        .map((t) => t.taskId)
    );
  }, [executionQueueTasks]);

  const {
    data: peerFeedback,
    refetch: refetchPeerFeedback
  } = useExecutionPeer(projectPath);
  const startRalphMutation = useStartRalph();
  const stopRalphMutation = useStopRalph();
  const [removingQueueTaskKeys, setRemovingQueueTaskKeys] = useState<Set<string>>(new Set());

  // Refresh queue tasks when execution stops
  const wasRunning = useRef(false);
  useEffect(() => {
    const isRunningNow = ralphStatus?.running ?? false;
    if (wasRunning.current && !isRunningNow) {
      void loadQueueTasks();
    }
    wasRunning.current = isRunningNow;
  }, [ralphStatus?.running, loadQueueTasks]);

  // Update task status to be more live
  const getQueuedTaskStatus = useCallback((taskId: string) => {
    const baseStatus = baseGetQueuedTaskStatus(taskId);

    if (ralphStatus?.running && ralphStatus.currentStory?.startsWith(taskId)) {
      return 'running' as const;
    }

    // If execution is stopped, never expose stale "running" statuses in the UI.
    if (!ralphStatus?.running && baseStatus === 'running') {
      return 'queued' as const;
    }

    return baseStatus;
  }, [baseGetQueuedTaskStatus, ralphStatus]);

  // Use completed IDs from live data if available
  const completedIds = useMemo(() => {
    if (prdData?.userStories) {
      const specStoryIds = new Set(stories.map(s => s.id));
      return new Set(
        prdData.userStories
          .filter(s => s.passes && specStoryIds.has(s.id))
          .map(s => s.id)
      );
    }
    return baseCompletedIds;
  }, [prdData, baseCompletedIds, stories]);

  // Load decompose and queue state on spec change
  useEffect(() => {
    if (selectedPath) {
      loadDecomposeState();
      loadQueueTasks();
    } else {
      setStories([]);
      setQueueTasks([]);
    }
  }, [selectedPath, loadDecomposeState, loadQueueTasks, setStories, setQueueTasks]);

  const handleAddToQueue = useCallback(async (taskId: string) => {
    await addToQueue(taskId);
    await refetchLiveQueueTasks();
  }, [addToQueue, refetchLiveQueueTasks]);

  const handleRemoveFromQueue = useCallback(async (taskId: string) => {
    await removeFromQueue(taskId);
    await refetchLiveQueueTasks();
  }, [removeFromQueue, refetchLiveQueueTasks]);

  // Add all tasks to queue
  const handleAddAllToQueue = useCallback(async () => {
    const tasksToAdd = stories.filter((s) => !s.passes && !queueTasks.some(t => t.taskId === s.id));
    for (const task of tasksToAdd) {
      await addToQueue(task.id);
    }
    if (tasksToAdd.length > 0) {
      await refetchLiveQueueTasks();
    }
  }, [stories, queueTasks, addToQueue, refetchLiveQueueTasks]);

  // Save task content
  const handleSaveTask = useCallback(
    async (task: UserStory) => {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/decompose/update-task?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, task }),
      });
      setStories((prevStories) =>
        prevStories.map((story) => (story.id === task.id ? task : story))
      );
    },
    [specId, projectPath, setStories]
  );

  // Navigate to queue execution
  const handleRunQueue = useCallback(() => {
    startRalphMutation.mutate({ project: projectPath });
    setIsExecutionModalOpen(true);
  }, [projectPath, startRalphMutation]);

  const handleStopExecution = useCallback(() => {
    stopRalphMutation.mutate({ project: projectPath });
  }, [projectPath, stopRalphMutation]);

  const handleRemoveQueueTask = useCallback(async (targetSpecId: string, taskId: string) => {
    const key = `${targetSpecId}:${taskId}`;
    setRemovingQueueTaskKeys((prev) => new Set(prev).add(key));
    try {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/queue/${targetSpecId}/${taskId}?${params}`, { method: 'DELETE' });
      queryClient.setQueryData(
        executionKeys.queue(projectPath),
        (prev: QueuedTaskWithData[] | undefined) =>
          (prev ?? []).filter((task) => !(task.specId === targetSpecId && task.taskId === taskId))
      );
      await Promise.all([loadQueueTasks(), refetchLiveQueueTasks()]);
    } finally {
      setRemovingQueueTaskKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [projectPath, loadQueueTasks, queryClient, refetchLiveQueueTasks]);

  // Ensure live queue data is hydrated whenever the live modal opens, including page-refresh cases.
  useEffect(() => {
    if (!isExecutionModalOpen) return;
    void Promise.all([loadQueueTasks(), refetchLiveQueueTasks()]);
  }, [isExecutionModalOpen, loadQueueTasks, refetchLiveQueueTasks]);

  // If execution is active but queue data is temporarily empty, keep retrying fetches
  // so the live modal doesn't stay blank until a manual reopen.
  useEffect(() => {
    if (!isExecutionModalOpen) return;
    if (!ralphStatus?.running) return;
    if ((executionQueueTasks?.length ?? 0) > 0) return;

    void refetchLiveQueueTasks();
    const retryId = window.setInterval(() => {
      void refetchLiveQueueTasks();
    }, 1500);

    return () => window.clearInterval(retryId);
  }, [isExecutionModalOpen, ralphStatus?.running, executionQueueTasks?.length, refetchLiveQueueTasks]);

  // Navigate to a specific spec from the execution modal
  const handleNavigateToSpec = useCallback((specId: string) => {
    // Try to find the file path from the specId (e.g. 'auth.prd' -> 'specs/auth.prd.md')
    // We search through the files tree flattened
    const findPath = (nodes: any[]): string | null => {
      for (const node of nodes) {
        if (node.type === 'file' && (node.path.includes(specId) || node.name.includes(specId))) {
          return node.path;
        }
        if (node.children) {
          const childPath = findPath(node.children);
          if (childPath) return childPath;
        }
        if (node.linkedSpecs) {
          const linkedPath = findPath(node.linkedSpecs);
          if (linkedPath) return linkedPath;
        }
      }
      return null;
    };

    const path = findPath(files);
    if (path) {
      setSelectedPath(path);
      setIsExecutionModalOpen(false); // Close modal on navigation
    }
  }, [files, setSelectedPath]);

  // New spec creation
  const [isNewSpecDrawerOpen, setIsNewSpecDrawerOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecType, setNewSpecType] = useState<'prd' | 'tech-spec' | 'bug'>('prd');

  const handleCreateSpecSuccess = useCallback(
    (path: string) => {
      setSelectedPath(path);
      setIsNewSpecDrawerOpen(false);
      setNewSpecName('');
    },
    [setSelectedPath]
  );

  const { isCreating: isCreatingSpec, createSpec } = useCreateSpec({
    projectPath,
    onSuccess: handleCreateSpecSuccess,
    refreshFiles,
  });

  const handleCreateNewSpec = useCallback(async () => {
    await createSpec(newSpecName, newSpecType);
  }, [createSpec, newSpecName, newSpecType]);

  // Tech spec creation modal
  const [isCreateTechSpecModalOpen, setIsCreateTechSpecModalOpen] = useState(false);

  const handleTechSpecCreated = useCallback(
    (path: string) => {
      refreshFiles();
      setSelectedPath(path);
      setIsCreateTechSpecModalOpen(false);
    },
    [refreshFiles, setSelectedPath]
  );

  // Chat UI state
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const isReviewPanelOpen = searchParams.get('panel') === 'open';
  const setIsReviewPanelOpen = useCallback((open: boolean) => {
    setSearchParams(prev => {
      if (open) {
        prev.set('panel', 'open');
      } else {
        prev.delete('panel');
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const [tasksVisible, setTasksVisible] = useState(true);

  // Auto-open review panel when review finishes
  const prevIsStartingReview = useRef(isStartingReview);
  useEffect(() => {
    if (prevIsStartingReview.current && !isStartingReview) {
      setIsReviewPanelOpen(true);
    }
    prevIsStartingReview.current = isStartingReview;
  }, [isStartingReview, setIsReviewPanelOpen]);

  // Auto-open review panel once per spec when there are pending comments.
  useEffect(() => {
    if (!selectedPath) return;

    const hasPendingSuggestions = (session?.suggestions ?? []).some(
      (suggestion) => suggestion.status === 'pending'
    );
    if (!hasPendingSuggestions) return;

    if (isReviewPanelOpen) {
      hasAutoOpenedReviewPanelForPath.current = selectedPath;
      return;
    }

    if (hasAutoOpenedReviewPanelForPath.current === selectedPath) {
      return;
    }

    setIsReviewPanelOpen(true);
    hasAutoOpenedReviewPanelForPath.current = selectedPath;
  }, [selectedPath, session?.suggestions, isReviewPanelOpen, setIsReviewPanelOpen]);

  // Reset state on spec change
  useEffect(() => {
    const didPathChange = previousSelectedPath.current !== selectedPath;
    previousSelectedPath.current = selectedPath;
    if (!didPathChange) {
      return;
    }

    setIsConversationOpen(false);
    setSelectedContext(null);
    setIsReviewPanelOpen(false);
    hasAutoOpenedReviewPanelForPath.current = null;
  }, [selectedPath, setIsReviewPanelOpen]);

  // Send message handler
  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim()) return;
    setIsConversationOpen(true);
    const suggestionIdForMessage = selectedContext ? undefined : discussingContext?.suggestionId;
    handleSendChatMessage(inputValue, selectedContext ?? undefined, suggestionIdForMessage);
    setInputValue('');
    // Clear discussing context after sending
    if (discussingContext) {
      setDiscussingContext(null);
    }
    if (selectedContext) {
      setSelectedContext(null);
    }
  }, [inputValue, handleSendChatMessage, selectedContext, discussingContext, setDiscussingContext]);

  // Add selected text to conversation
  const handleAddToConversation = useCallback(
    (text: string) => {
      setDiscussingContext(null);
      setSelectedContext(text);
      setIsConversationOpen(true);
      setFocusTrigger((prev) => prev + 1);
    },
    [setDiscussingContext]
  );

  const handleNewChatWithSelectionReset = useCallback(() => {
    setSelectedContext(null);
    handleNewChat();
  }, [handleNewChat]);

  // Suggestion handlers
  const handleResolveSuggestion = useCallback(
    async (id: string) => {
      await handleSuggestionAction(id, 'approved');
    },
    [handleSuggestionAction]
  );

  const handleRejectSuggestion = useCallback(
    async (id: string) => {
      await handleSuggestionAction(id, 'dismissed');
    },
    [handleSuggestionAction]
  );

  // Go to suggestion location in editor


  // Scroll to tasks
  const scrollToTasks = useScrollToElement();
  const handleScrollToStories = useCallback(() => {
    scrollToTasks('tasks-section');
  }, [scrollToTasks]);

  // Derived values
  const isPrd = selectedSpecType === 'prd';
  const projectQueueCount = useMemo(
    () =>
      allQueueTasks.filter(
        (task) => task.status === 'queued' || task.status === 'running'
      ).length,
    [allQueueTasks]
  );

  const suggestions = session?.suggestions || [];

  return (
    <SidebarProvider useTabletBreakpoint>
      <AppSidebar
        files={files}
        selectedPath={selectedPath}
        onSelect={setSelectedPath}
        onCreateNew={() => setIsNewSpecDrawerOpen(true)}
        generatingSpec={generatingTechSpecInfo || undefined}
      />

      <SidebarInset className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Main content + Review Panel in flex row */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Scrollable content + Chat overlay */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <div className="flex-1 overflow-auto pb-32">
              <div className="mx-auto px-6 pt-2 lg:pt-4 pb-4">
                {selectedPath ? (
                  <>
                    <DocumentHeader
                      isSaving={isSaving}
                      lastSavedAt={lastSavedAt}
                      hasUnsavedChanges={hasUnsavedChanges}
                    />
                    <EditorSection
                      ref={editorRef}
                      content={content}
                      isLoading={isLoadingContent}
                      onChange={handleContentChange}
                      onAddToConversation={handleAddToConversation}
                    />

                    <TasksSection
                      stories={stories}
                      completedIds={completedIds}
                      queueTasks={queueTasks}
                      queueLoading={queueLoading}
                      specType={selectedSpecType}
                      isPrd={isPrd}
                      isDecomposing={isDecomposing}
                      decomposeError={decomposeError}
                      onClearError={() => setDecomposeError(null)}
                      isLoadingContent={isLoadingContent}
                      isGeneratingTechSpec={isGeneratingTechSpec}
                      ralphStatus={ralphStatus || defaultRalphStatus}
                      onDecompose={handleDecompose}
                      onAddToQueue={handleAddToQueue}
                      onRemoveFromQueue={handleRemoveFromQueue}
                      onAddAllToQueue={handleAddAllToQueue}
                      onSaveTask={handleSaveTask}
                      onRunQueue={handleRunQueue}
                      onViewLive={() => setIsExecutionModalOpen(true)}
                      onCreateTechSpec={() => setIsCreateTechSpecModalOpen(true)}
                      onTasksVisibilityChange={setTasksVisible}
                      getQueuedTaskStatus={getQueuedTaskStatus}
                      reviewFeedback={reviewFeedback}
                      reviewVerdict={reviewVerdict}
                      specStatus={specStatus}
                      specStatusMessage={specStatusMessage}
                    />
                  </>
                ) : (
                  <EmptyState onCreateNew={() => setIsNewSpecDrawerOpen(true)} />
                )}
              </div>
            </div>

            {/* Chat Area - overlays bottom of editor */}
            {selectedPath && (
              <ChatArea
                messages={filteredChatMessages}
                isSending={isSendingChat}
                discussingContext={discussingContext}
                onClearDiscussingContext={() => setDiscussingContext(null)}
                selectedContext={selectedContext}
                onClearSelectedContext={() => setSelectedContext(null)}
                suggestions={suggestions}
                isReviewPanelOpen={isReviewPanelOpen}
                onOpenReviewPanel={() => setIsReviewPanelOpen(true)}
                storiesCount={stories.length}
                isPrd={isPrd}
                tasksVisible={tasksVisible}
                onScrollToTasks={handleScrollToStories}
                isConversationOpen={isConversationOpen}
                onSetConversationOpen={setIsConversationOpen}
                inputValue={inputValue}
                onInputChange={setInputValue}
                onSendMessage={handleSendMessage}
                onNewChat={handleNewChatWithSelectionReset}
                onStartReview={handleStartReview}
                onGenerateStories={() => handleDecompose(false)}
                isStartingReview={isStartingReview}
                isGeneratingStories={isDecomposing}
                focusTrigger={focusTrigger}
                queueCount={projectQueueCount}
                onOpenQueue={() => setIsExecutionModalOpen(true)}
              />
            )}
          </div>

          {/* Execution Live Modal */}
          <ExecutionLiveModal
            isOpen={isExecutionModalOpen}
            onClose={() => setIsExecutionModalOpen(false)}
            ralphStatus={ralphStatus || defaultRalphStatus}
            logEntries={executionLogs?.entries || []}
            onStopExecution={handleStopExecution}
            onResumeExecution={handleRunQueue}
            onNavigateToSpec={handleNavigateToSpec}
            onRemoveTaskFromQueue={handleRemoveQueueTask}
            removingQueueTaskKeys={removingQueueTaskKeys}
            stories={prdData?.userStories || stories}
            queueTasks={executionQueueTasks}
            completedIds={liveCompletedIds || completedIds}
            peerFeedback={peerFeedback}
            onRefreshLessons={() => {
              void refetchPeerFeedback();
            }}
          />

          {/* Right: Review Panel (Codex-style) */}
          {/* Mobile + Tablet: Sheet overlay (below lg/1024px) */}
          {isSmallScreen && (
            <Sheet open={isReviewPanelOpen} onOpenChange={setIsReviewPanelOpen}>
              <SheetContent side="right" className="w-[320px] p-0 bg-background border-l">
                <SheetTitle className="sr-only">Review Panel</SheetTitle>
                <SheetDescription className="sr-only">
                  View and manage AI-generated suggestions for your spec
                </SheetDescription>
                <ReviewPanel
                  suggestions={suggestions}
                  onResolve={handleResolveSuggestion}
                  onDismiss={handleRejectSuggestion}
                  onReviewDiff={handleReviewDiff}
                  onDiscuss={(suggestion) => {
                    setSelectedContext(null);
                    handleDiscussSuggestion(suggestion);
                    setIsConversationOpen(true);
                    setIsReviewPanelOpen(false);
                  }}
                  onDismissAll={async () => {
                    const pendingIds = suggestions
                      .filter(s => s.status === 'pending')
                      .map(s => s.id);
                    await handleBulkSuggestionAction(pendingIds, 'dismissed');
                  }}
                  onClose={() => setIsReviewPanelOpen(false)}
                />
              </SheetContent>
            </Sheet>
          )}

          {/* Desktop: Inline panel (lg and above) */}
          <div
            className={`hidden lg:flex shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
              isReviewPanelOpen ? 'w-80' : 'w-0'
            }`}
          >
            <div className="w-80 h-full">
              <ReviewPanel
                suggestions={suggestions}
                onResolve={handleResolveSuggestion}
                onDismiss={handleRejectSuggestion}
                onReviewDiff={handleReviewDiff}
                onDiscuss={(suggestion) => {
                  setSelectedContext(null);
                  handleDiscussSuggestion(suggestion);
                  setIsConversationOpen(true);
                }}
                onDismissAll={async () => {
                  const pendingIds = suggestions
                    .filter(s => s.status === 'pending')
                    .map(s => s.id);
                  await handleBulkSuggestionAction(pendingIds, 'dismissed');
                }}
                onClose={() => setIsReviewPanelOpen(false)}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
      
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

      {/* New Spec Drawer */}
      <NewSpecDrawer
        isOpen={isNewSpecDrawerOpen}
        name={newSpecName}
        type={newSpecType}
        isCreating={isCreatingSpec}
        onNameChange={setNewSpecName}
        onTypeChange={setNewSpecType}
        onCreate={handleCreateNewSpec}
        onClose={() => setIsNewSpecDrawerOpen(false)}
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
