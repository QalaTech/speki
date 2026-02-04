import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

// Components
import { AppSidebar } from '../../components/specs/AppSidebar';
import { SidebarProvider, SidebarInset } from '../../components/ui/sidebar';
import { CreateTechSpecModal } from '../../components/specs/CreateTechSpecModal';
import { NewSpecDrawer } from '../../components/specs/NewSpecDrawer';
import type { SpecEditorRef } from '../../components/shared/SpecEditor';

import { getSpecTypeFromFilename } from '../../components/specs/types';

// Hooks
import { useSpecFileTree } from '../../hooks/useSpecFileTree';
import { useSpecContent } from '../../hooks/useSpecContent';
import { useSpecReview } from '../../hooks/useSpecReview';
import { useSpecChat } from '../../hooks/useSpecChat';
import { apiFetch } from '../../components/ui/ErrorContext';
import {
  useAutoSave,
  useDocumentTitle,
  useCreateSpec,
  useDecompose,
  useQueueManagement,
  useScrollToElement,
} from './hooks';

// Sub-components
import { DocumentHeader, EditorSection, TasksSection, EmptyState, ChatArea } from './components';
import { ReviewPanel } from './components/ChatArea/ReviewPanel';

// Types
import type { UserStory } from '../../types';

interface SpecWorkspaceProps {
  projectPath: string;
}

export function SpecWorkspace({ projectPath }: SpecWorkspaceProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPath = searchParams.get('spec');
  const editorRef = useRef<SpecEditorRef>(null);

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
  } = useSpecContent({
    projectPath,
    selectedPath,
  });

  // Auto-save
  const { lastSavedAt, isSaving } = useAutoSave({
    content,
    hasUnsavedChanges,
    onSave: handleSave,
  });

  // Document title extraction
  const selectedFileName = selectedPath?.split('/').pop() || '';
  const selectedSpecType = getSpecTypeFromFilename(selectedFileName);
  const documentTitle = useDocumentTitle({ content, filename: selectedFileName });

  // AI Review workflow
  const {
    session,
    setSession,
    isStartingReview,
    handleStartReview,
    handleSuggestionAction,
  } = useSpecReview({
    projectPath,
    selectedPath,
    content,
    onContentChange: setContent,
    onSave: handleSave,
  });

  // Chat input state - must be before useSpecChat
  const [inputValue, setInputValue] = useState('');

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
    onContentRefetch: async () => {
      // Content will auto-refresh via file watcher
    },
    setInputValue,
  });

  // Decompose state and operations
  const {
    stories,
    setStories,
    isDecomposing,
    handleDecompose,
    loadDecomposeState,
  } = useDecompose({
    projectPath,
    selectedPath,
  });

  // Queue management
  const specId = selectedPath?.split('/').pop()?.replace(/\.md$/i, '') || '';
  const {
    queueTasks,
    setQueueTasks,
    queueLoading,
    completedIds,
  
    loadQueueTasks,
    addToQueue,
    removeFromQueue,
  } = useQueueManagement({
    specId,
    projectPath,
  });

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

  // Add all tasks to queue
  const handleAddAllToQueue = useCallback(async () => {
    const tasksToAdd = stories.filter((s) => !s.passes && !queueTasks.some(t => t.taskId === s.id));
    for (const task of tasksToAdd) {
      await addToQueue(task.id);
    }
  }, [stories, queueTasks, addToQueue]);

  // Save task content
  const handleSaveTask = useCallback(
    async (task: UserStory, taskContent: string) => {
      const params = new URLSearchParams({ project: projectPath });
      await apiFetch(`/api/decompose/update-task?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, task: { ...task, content: taskContent } }),
      });
      await loadDecomposeState();
    },
    [specId, projectPath, loadDecomposeState]
  );

  // Navigate to queue execution
  const handleRunQueue = useCallback(() => {
    navigate(`/execution/kanban?project=${encodeURIComponent(projectPath)}`);
  }, [navigate, projectPath]);

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
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [tasksVisible, setTasksVisible] = useState(true);

  // Reset state on spec change
  useEffect(() => {
    setIsConversationOpen(false);
    setIsReviewPanelOpen(false);
  }, [selectedPath]);

  // Send message handler
  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim()) return;
    setIsConversationOpen(true);
    handleSendChatMessage(inputValue, undefined, discussingContext?.suggestionId);
    setInputValue('');
    // Clear discussing context after sending
    if (discussingContext) {
      setDiscussingContext(null);
    }
  }, [inputValue, handleSendChatMessage, discussingContext, setDiscussingContext]);

  // Add selected text to conversation
  const handleAddToConversation = useCallback(
    (text: string) => {
      setInputValue((prev) => prev + (prev ? '\n\n' : '') + `Regarding: "${text}"`);
    },
    []
  );

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

  const suggestions = session?.suggestions || [];

  return (
    <SidebarProvider>
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
          {/* Left: Scrollable content + Chat */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-auto">
              <div className="max-w-5xl mx-auto px-6 py-8 pb-4">
                {selectedPath ? (
                  <>
                    <DocumentHeader
                      title={documentTitle}
                      specType={selectedSpecType}
                      storiesCount={stories.length}
                      isPrd={isPrd}
                      isSaving={isSaving}
                      lastSavedAt={lastSavedAt}
                      hasUnsavedChanges={hasUnsavedChanges}
                      onScrollToStories={handleScrollToStories}
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
                      isLoadingContent={isLoadingContent}
                      isGeneratingTechSpec={isGeneratingTechSpec}
                      onDecompose={handleDecompose}
                      onAddToQueue={addToQueue}
                      onRemoveFromQueue={removeFromQueue}
                      onAddAllToQueue={handleAddAllToQueue}
                      onSaveTask={handleSaveTask}
                      onRunQueue={handleRunQueue}
                      onCreateTechSpec={() => setIsCreateTechSpecModalOpen(true)}
                      onTasksVisibilityChange={setTasksVisible}
                    />
                  </>
                ) : (
                  <EmptyState onCreateNew={() => setIsNewSpecDrawerOpen(true)} />
                )}
              </div>
            </div>

            {/* Chat Area */}
            {selectedPath && (
              <ChatArea
                messages={filteredChatMessages}
                isSending={isSendingChat}
                discussingContext={discussingContext}
                onClearDiscussingContext={() => setDiscussingContext(null)}
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
                onNewChat={handleNewChat}
                onStartReview={handleStartReview}
                isStartingReview={isStartingReview}
              />
            )}
          </div>

          {/* Right: Review Panel (Codex-style) */}
          <div 
            className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
              isReviewPanelOpen ? 'w-80' : 'w-0'
            }`}
          >
            <div className="w-80 h-full"> 
              <ReviewPanel
                suggestions={suggestions}
                onResolve={handleResolveSuggestion}
                onDismiss={handleRejectSuggestion}
                onDiscuss={(suggestion) => {
                  handleDiscussSuggestion(suggestion);
                  setIsConversationOpen(true);
                }}
                onClose={() => setIsReviewPanelOpen(false)}
              />
            </div>
          </div>
        </div>
      </SidebarInset>

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
