/**
 * SpecExplorer - Main component for browsing and editing spec files.
 *
 * Uses custom hooks for state management:
 * - useResizablePanel: Panel resize logic
 * - useSpecFileTree: File tree with status merging
 * - useSpecContent: Content loading/saving
 * - useSpecReview: Review workflow
 * - useSpecChat: Chat functionality
 * - useSpecCreation: New spec creation
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SpecTree } from './SpecTree';
import { SpecHeader, type SpecTab } from './SpecHeader';
import { type SpecEditorRef } from '../shared/SpecEditor';
import { SpecDecomposeTab } from './SpecDecomposeTab';
import { DiffOverlay } from './DiffOverlay';
import { ReviewChat } from '../review/ReviewChat';
import { CreateTechSpecModal } from './CreateTechSpecModal';
import { SpecExplorerPreviewTab } from './SpecExplorerPreviewTab';
import { ReviewPanel } from './ReviewPanel';
import { NewSpecModal } from './NewSpecModal';
import { MagnifyingGlassIcon, ChevronLeftIcon, RocketLaunchIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';

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

// CSS keyframes (moved to separate style block)
const animationStyles = `
  @keyframes spec-review-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes chat-pulse {
    0%, 100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); }
    50% { box-shadow: 0 4px 20px rgba(88, 166, 255, 0.4); }
  }
  @keyframes chat-popup-enter {
    from { opacity: 0; transform: translateY(20px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes modal-overlay-enter {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes modal-enter {
    from { opacity: 0; transform: scale(0.95) translateY(-10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .animate-spin-slow { animation: spec-review-spin 1s linear infinite; }
  .animate-chat-pulse { animation: chat-pulse 2s infinite; }
  .animate-chat-popup { animation: chat-popup-enter 0.2s ease; }
  .animate-modal-overlay { animation: modal-overlay-enter 0.15s ease; }
  .animate-modal { animation: modal-enter 0.2s ease; }
`;

export function SpecExplorer({ projectPath }: SpecExplorerProps) {
  // URL state management
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPath, setSelectedPathState] = useState<string | null>(
    () => searchParams.get('spec') || null
  );

  // Sync selectedPath with URL
  const setSelectedPath = useCallback((path: string | null) => {
    setSelectedPathState(path);
    setSearchParams(prev => {
      if (path) {
        prev.set('spec', path);
      } else {
        prev.delete('spec');
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  // Tab state
  const [activeTab, setActiveTab] = useState<SpecTab>('preview');
  const editorRef = useRef<SpecEditorRef>(null);

  // Review panel drawer state
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(true);

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
    // Clear old messages by setting a new timestamp
    setDiscussStartTimestamp(new Date().toISOString());

    // Open the chat panel
    setIsChatOpen(true);

    // Send the message with selection context
    // Format: include the selected text as context for the AI
    const messageWithContext = `Regarding this text from the spec:\n\n> ${selectedText}\n\n${question}`;
    handleSendChatMessage(messageWithContext, selectedText);
  }, [setDiscussStartTimestamp, setIsChatOpen, handleSendChatMessage]);

  // Reset state when project changes
  useEffect(() => {
    setSelectedPathState(null);
    setActiveTab('preview');
    setIsChatOpen(false);
    setDiscussingContext(null);
  }, [projectPath, setIsChatOpen, setDiscussingContext]);

  // Track decompose state for selected PRD (needed for Generate Tech Spec button visibility)
  const [decomposeStoryCount, setDecomposeStoryCount] = useState(0);

  // Derived values
  const selectedFileName = selectedPath?.split('/').pop() || '';
  const selectedSpecType = getSpecTypeFromFilename(selectedFileName);

  // Fetch decompose state when a PRD is selected
  useEffect(() => {
    if (!selectedPath || selectedSpecType !== 'prd') {
      setDecomposeStoryCount(0);
      return;
    }

    const fetchDecomposeState = async () => {
      try {
        const res = await apiFetch(`/api/decompose/draft?specPath=${encodeURIComponent(selectedPath)}&project=${encodeURIComponent(projectPath)}`);
        const data = await res.json();
        setDecomposeStoryCount(data.draft?.userStories?.length || 0);
      } catch {
        setDecomposeStoryCount(0);
      }
    };

    fetchDecomposeState();
  }, [selectedPath, selectedSpecType, projectPath]);

  // Compute progress for PRDs (needed for Generate Tech Spec button)
  // We only need total > 0 to show the button, completed count not used in header
  const prdProgress = selectedSpecType === 'prd' && decomposeStoryCount > 0
    ? { completed: 0, total: decomposeStoryCount }
    : undefined;

  // Render tab content
  const renderTabContent = () => {
    if (isLoadingContent) {
      return <div className="flex items-center justify-center h-full text-base-content/60 text-sm">Loading...</div>;
    }

    if (!selectedPath) {
      if (files.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-base-content/60 text-sm text-center p-10 gap-3 max-w-[400px] mx-auto">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 mb-2">
              <RocketLaunchIcon className="w-12 h-12 text-primary" />
            </div>
            <h2 className="m-0 text-2xl font-semibold text-base-content">Welcome to SPEKI!</h2>
            <p className="m-0 text-sm text-base-content/60 leading-relaxed">
              Create your first spec to start building with iterative AI development.
              Specs define what you want to build - Ralph will help you refine and implement them.
            </p>
            <button
              className="mt-4 py-3 px-6 bg-primary border-none rounded-lg text-white text-[15px] font-medium cursor-pointer transition-all duration-150 hover:bg-primary-hover hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-none"
              onClick={handleOpenNewSpecModal}
            >
              + Create Your First Spec
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center h-full text-base-content/60 text-sm text-center p-10">
          <p>Select a spec from the tree to view it</p>
        </div>
      );
    }

    // Keep both tabs mounted but hide inactive one for performance
    // This prevents the heavy MDX editor from re-initializing on tab switch
    return (
      <>
        <div className={activeTab === 'preview' ? 'flex flex-col h-full' : 'hidden'}>
          <SpecExplorerPreviewTab
            content={content}
            isEditing={isEditing}
            onContentChange={handleContentChange}
            editorRef={editorRef}
            onSelectionAsk={handleSelectionAsk}
          />
        </div>
        <div className={activeTab === 'decompose' ? 'flex flex-col h-full' : 'hidden'}>
          <SpecDecomposeTab
            specPath={selectedPath}
            projectPath={projectPath}
            specType={selectedSpecType}
            onCreateTechSpec={handleOpenCreateTechSpec}
            onQuickExecute={handleQuickExecute}
            isGeneratingTechSpec={isGeneratingTechSpec}
          />
        </div>
      </>
    );
  };

  return (
    <>
      <style>{animationStyles}</style>
      <div className="flex h-full bg-base-100">
        {/* Tree Panel (Left) */}
        <div className="flex-shrink-0 min-w-[180px] max-w-[500px] h-full overflow-hidden" style={{ width: treeWidth }}>
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
          className="flex-shrink-0 w-1 h-full bg-gradient-to-b from-transparent via-base-content/10 to-transparent cursor-col-resize relative z-10 transition-all duration-200 hover:bg-primary/30 hover:w-1.5 hover:shadow-lg hover:shadow-primary/20 group"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-base-content/5 group-hover:bg-primary/50 transition-colors" />
        </div>

        {/* Document Area (Center) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-base-100">
          {selectedPath && (
            <SpecHeader
              fileName={selectedFileName}
              filePath={selectedPath}
              activeTab={activeTab}
              onTabChange={setActiveTab}
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
            />
          )}

          <div className="flex-1 overflow-hidden min-h-0">
            {renderTabContent()}
          </div>
        </div>

        {/* Review Panel (Right) - only on preview tab */}
        {selectedPath && activeTab === 'preview' && (
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
              className="flex flex-col items-center justify-center gap-3 w-12 h-full bg-gradient-to-l from-base-200 to-base-200/50 border-l border-base-content/5 hover:from-secondary/10 hover:to-secondary/5 transition-all duration-300 cursor-pointer group shadow-inner"
              onClick={() => setIsReviewPanelOpen(true)}
              title="Open Review Panel"
            >
              <ChevronLeftIcon className="h-4 w-4 text-base-content/40 group-hover:text-secondary group-hover:-translate-x-0.5 transition-all duration-200" />
              <div className="flex flex-col items-center gap-2">
                <div className="p-2 rounded-lg bg-secondary/10 group-hover:bg-secondary/20 transition-colors ring-1 ring-secondary/20">
                  <MagnifyingGlassIcon className="h-4 w-4 text-secondary" />
                </div>
                <span className="text-[11px] font-medium text-base-content/50 group-hover:text-secondary/80 [writing-mode:vertical-rl] rotate-180 tracking-wide transition-colors">
                  Review
                </span>
              </div>
              {session && session.suggestions.filter(s => s.status === 'pending').length > 0 && (
                <span className="badge badge-xs badge-secondary shadow-sm animate-pulse">
                  {session.suggestions.filter(s => s.status === 'pending').length}
                </span>
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

        {/* Chat Popup */}
        {selectedPath && (
          <>
            {/* Chat Toggle Button */}
            <button
              className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl flex items-center justify-center text-xl transition-all duration-300 ${
                isChatOpen
                  ? 'bg-gradient-to-br from-error to-error/80 text-error-content shadow-lg shadow-error/30 hover:shadow-xl hover:shadow-error/40 hover:scale-105'
                  : 'bg-gradient-to-br from-primary to-primary/80 text-primary-content shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 animate-chat-pulse'
              }`}
              onClick={() => setIsChatOpen(!isChatOpen)}
              title={isChatOpen ? 'Close chat' : 'Open chat'}
            >
              {isChatOpen ? <XMarkIcon className="w-5 h-5" /> : <ChatBubbleLeftRightIcon className="w-5 h-5" />}
              {!isChatOpen && (session?.chatMessages?.length ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 badge badge-sm badge-secondary ring-2 ring-base-100 shadow-md">
                  {session?.chatMessages?.length}
                </span>
              )}
            </button>

            {/* Chat Popup Panel */}
            {isChatOpen && (
              <div className="fixed top-16 bottom-24 right-6 z-50 w-[768px] bg-gradient-to-b from-base-200 to-base-200/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-base-content/5 ring-1 ring-base-content/10 flex flex-col overflow-hidden animate-chat-popup">
                <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-base-300/80 to-base-300/60 border-b border-base-content/5 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                      <ChatBubbleLeftRightIcon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-base-content">Review Chat</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {filteredChatMessages.length > 0 && (
                      <button
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-base-content/60 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                        onClick={handleNewChat}
                        title="Start a new chat session"
                      >
                        New Chat
                      </button>
                    )}
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-base-content/50 hover:text-error hover:bg-error/10 transition-all duration-200"
                      onClick={() => setIsChatOpen(false)}
                    >
                      ✕
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
              </div>
            )}
          </>
        )}

        {/* New Spec Modal */}
        {isNewSpecModalOpen && (
          <NewSpecModal
            name={newSpecName}
            type={newSpecType}
            isCreating={isCreatingSpec}
            onNameChange={setNewSpecName}
            onTypeChange={setNewSpecType}
            onCreate={handleCreateNewSpec}
            onCancel={handleCancelNewSpec}
          />
        )}

        {/* Create Tech Spec Modal */}
        {isCreateTechSpecModalOpen && selectedPath && (
          <CreateTechSpecModal
            isOpen={isCreateTechSpecModalOpen}
            onClose={handleCloseTechSpecModal}
            prdSpecId={selectedPath.replace(/^.*\//, '').replace(/\.md$/, '')}
            prdName={selectedFileName}
            userStories={prdUserStories}
            projectPath={projectPath}
            onCreated={(path) => {
              handleTechSpecCreated(path);
              setSelectedPath(path);
            }}
            onGenerationStart={(specName) => {
              setIsGeneratingTechSpec(true);
              setGeneratingTechSpecInfo({
                parentPath: selectedPath,
                name: specName,
              });
            }}
          />
        )}
      </div>
    </>
  );
}
