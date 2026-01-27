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
import { NewSpecDrawer } from './NewSpecDrawer';
import { 
  MagnifyingGlassIcon, 
  ChevronLeftIcon, 
  RocketLaunchIcon, 
  XMarkIcon 
} from '@heroicons/react/24/outline';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { Button } from "../ui/Button";
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

  // Use refs to track state values to avoid stale closure issues in callbacks
  // This ensures we always have the latest values even during rapid re-renders
  const isSendingChatRef = useRef(isSendingChat);
  isSendingChatRef.current = isSendingChat;

  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;

  // Stable handler for drawer open/close that prevents closing during message sending
  // Using refs instead of dependencies to avoid callback recreation during streaming
  const handleChatDrawerOpenChange = useCallback((open: boolean) => {
    // Skip if value isn't actually changing (prevents unnecessary re-renders)
    if (open === isChatOpenRef.current) return;
    // Never allow closing while sending - vaul can trigger onOpenChange spuriously
    if (!open && isSendingChatRef.current) return;
    setIsChatOpen(open);
  }, [setIsChatOpen]);

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

  // Fetch decompose story count for the selected PRD
  const fetchDecomposeStoryCount = useCallback(async () => {
    if (!selectedPath || selectedSpecType !== 'prd') {
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
  }, [selectedPath, selectedSpecType, projectPath]);

  // Fetch on mount and when selection changes
  useEffect(() => {
    fetchDecomposeStoryCount();
  }, [fetchDecomposeStoryCount]);

  // Compute progress for PRDs (needed for Generate Tech Spec button)
  // We only need total > 0 to show the button, completed count not used in header
  const prdProgress = selectedSpecType === 'prd' && decomposeStoryCount > 0
    ? { completed: 0, total: decomposeStoryCount }
    : undefined;

  // Render tab content
  const renderTabContent = () => {
    if (isLoadingContent) {
      return <SpecContentSkeleton />;
    }

    if (!selectedPath) {
      if (files.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-base-content/60 text-sm text-center p-10 gap-4 max-w-[400px] mx-auto animate-in fade-in zoom-in-95 duration-700">
            <div className="p-5 rounded-3xl bg-linear-to-br from-primary/25 to-secondary/15 shadow-glass animate-bounce-slow">
              <RocketLaunchIcon className="w-14 h-14 text-primary" />
            </div>
            <h2 className="m-0 text-2xl font-semibold text-base-content">Welcome to SPEKI!</h2>
            <p className="m-0 text-sm text-base-content/60 leading-relaxed">
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
            onDecomposeComplete={fetchDecomposeStoryCount}
          />
        </div>
      </>
    );
  };

  return (
    <div className="flex h-full bg-base-100">
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
          className="shrink-0 w-1 h-full bg-linear-to-b from-transparent via-base-content/10 to-transparent cursor-col-resize relative z-10 transition-all duration-200 hover:bg-primary/30 hover:w-1.5 hover:shadow-lg hover:shadow-primary/30 group"
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
              className="flex flex-col items-center justify-center gap-4 w-12 h-full bg-linear-to-l from-base-200/80 to-base-200/30 border-l border-border/30 hover:from-secondary/15 hover:to-secondary/5 transition-all duration-500 cursor-pointer group shadow-glass"
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

        {/* Chat Toggle Button - Outside Drawer to avoid vaul interference */}
        
          <div className="fixed bottom-6 right-6 z-50">
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-300 active-press shadow-2xl ${
                isChatOpen
                  ? 'bg-error text-error-foreground'
                  : 'bg-foreground text-background scale-100 hover:scale-105'
              }`}
              title={isChatOpen ? 'Close chat' : 'Open chat'}
            >
              {isChatOpen ? <XMarkIcon className="w-5 h-5" /> : <ChatBubbleLeftRightIcon className="w-5 h-5" />}
              {!isChatOpen && (session?.chatMessages?.length ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                  {session?.chatMessages?.length}
                </span>
              )}
            </button>
          </div>
        

        {/* Chat Drawer - Always mounted to prevent unmount/remount flicker, controlled via open prop */}
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
