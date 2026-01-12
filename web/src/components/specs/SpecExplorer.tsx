import { useState, useEffect, useCallback, useRef } from 'react';
import { SpecTree, type SpecFileNode } from './SpecTree';
import { SpecHeader, type SpecTab } from './SpecHeader';
import { SpecEditor, type SpecEditorRef } from '../SpecEditor';
import { SpecDecomposeTab } from './SpecDecomposeTab';
import { DiffOverlay } from './DiffOverlay';
import { ReviewChat, type DiscussingContext } from '../ReviewChat';
import './SpecExplorer.css';

interface SpecExplorerProps {
  projectPath: string;
}

interface SpecSession {
  sessionId: string;
  status: 'in_progress' | 'completed' | 'needs_attention';
  suggestions: Suggestion[];
  reviewResult: ReviewResult | null;
  chatMessages: ChatMessage[];
}

interface Suggestion {
  id: string;
  type?: 'change' | 'comment';
  severity: 'critical' | 'warning' | 'info';
  location: { section: string; lineStart: number; lineEnd: number };
  issue: string;
  suggestedFix: string;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
}

interface ReviewResult {
  verdict: 'PASS' | 'FAIL' | 'NEEDS_IMPROVEMENT' | 'SPLIT_RECOMMENDED';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestionId?: string;
}

export function SpecExplorer({ projectPath }: SpecExplorerProps) {
  // Tree state
  const [files, setFiles] = useState<SpecFileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [, setIsLoadingTree] = useState(true);

  // Content state
  const [content, setContent] = useState<string>('');
  const [, setOriginalContent] = useState<string>('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<SpecTab>('preview');
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editorRef = useRef<SpecEditorRef>(null);

  // Session state (for review tab)
  const [session, setSession] = useState<SpecSession | null>(null);
  const [isStartingReview, setIsStartingReview] = useState(false);

  // Diff overlay state
  const [diffOverlay, setDiffOverlay] = useState<{
    isOpen: boolean;
    suggestion: Suggestion | null;
    originalText: string;
    proposedText: string;
  }>({ isOpen: false, suggestion: null, originalText: '', proposedText: '' });

  // Chat popup state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [discussingContext, setDiscussingContext] = useState<DiscussingContext | null>(null);
  // Timestamp marking when a "fresh" discuss session started (messages before this are hidden)
  const [discussStartTimestamp, setDiscussStartTimestamp] = useState<string | null>(null);

  // New spec modal state
  const [isNewSpecModalOpen, setIsNewSpecModalOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState('');
  const [isCreatingSpec, setIsCreatingSpec] = useState(false);

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Merge review statuses into tree
  function mergeStatusesIntoTree(
    nodes: SpecFileNode[],
    statuses: Record<string, string>
  ): SpecFileNode[] {
    return nodes.map(node => {
      if (node.type === 'file') {
        return {
          ...node,
          reviewStatus: (statuses[node.path] || 'none') as SpecFileNode['reviewStatus'],
        };
      }
      if (node.children) {
        return {
          ...node,
          children: mergeStatusesIntoTree(node.children, statuses),
        };
      }
      return node;
    });
  }

  // Fetch tree structure and statuses
  useEffect(() => {
    async function fetchFilesAndStatuses() {
      setIsLoadingTree(true);
      try {
        // Fetch both in parallel
        const [filesRes, statusesRes] = await Promise.all([
          fetch(apiUrl('/api/spec-review/files')),
          fetch(apiUrl('/api/sessions/statuses')),
        ]);

        const filesData = await filesRes.json();
        const statusesData = await statusesRes.json();

        // Merge statuses into tree
        const filesWithStatus = mergeStatusesIntoTree(
          filesData.files || [],
          statusesData.statuses || {}
        );
        setFiles(filesWithStatus);

        // Auto-select first file if none selected
        if (!selectedPath && filesWithStatus?.length > 0) {
          const firstFile = findFirstFile(filesWithStatus);
          if (firstFile) setSelectedPath(firstFile.path);
        }
      } catch (err) {
        console.error('Failed to fetch spec files:', err);
      } finally {
        setIsLoadingTree(false);
      }
    }
    fetchFilesAndStatuses();
  }, [projectPath, apiUrl]);

  // Reset review state when file changes
  useEffect(() => {
    setIsStartingReview(false);
  }, [selectedPath]);

  // Fetch file content when selection changes
  useEffect(() => {
    if (!selectedPath) return;

    async function fetchContent() {
      setIsLoadingContent(true);
      try {
        const res = await fetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath!)}`));
        const data = await res.json();
        const fileContent = data.content || '';
        setContent(fileContent);
        setOriginalContent(fileContent);
        setHasUnsavedChanges(false);
      } catch (err) {
        console.error('Failed to fetch spec content:', err);
      } finally {
        setIsLoadingContent(false);
      }
    }

    // Also fetch session if exists
    async function fetchSession() {
      try {
        const res = await fetch(apiUrl(`/api/sessions/spec/${encodeURIComponent(selectedPath!)}`));
        if (res.ok) {
          const data = await res.json();
          setSession(data.session || null);
        } else {
          setSession(null);
        }
      } catch {
        setSession(null);
      }
    }

    fetchContent();
    fetchSession();
  }, [selectedPath, apiUrl]);

  // Poll for session updates when status is in_progress
  useEffect(() => {
    if (!session || session.status !== 'in_progress' || !selectedPath) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/sessions/spec/${encodeURIComponent(selectedPath)}`));
        if (res.ok) {
          const data = await res.json();
          if (data.session && data.session.status !== 'in_progress') {
            // Review completed or errored - update session
            setSession(data.session);
          }
        }
      } catch (error) {
        console.error('Failed to poll session status:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [session?.status, selectedPath, apiUrl]);

  // Find first file in tree (DFS)
  function findFirstFile(nodes: SpecFileNode[]): SpecFileNode | null {
    for (const node of nodes) {
      if (node.type === 'file') return node;
      if (node.children) {
        const found = findFirstFile(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  // Get selected file name
  const selectedFileName = selectedPath?.split('/').pop() || '';

  // Get review status for current file
  const getReviewStatus = (): 'reviewed' | 'pending' | 'god-spec' | 'in-progress' | 'none' => {
    if (!session) return 'none';
    if (session.status === 'in_progress') return 'in-progress';
    if (session.reviewResult?.verdict === 'SPLIT_RECOMMENDED') return 'god-spec';
    const pendingSuggestions = session.suggestions.filter(s => s.status === 'pending');
    if (pendingSuggestions.length > 0) return 'pending';
    if (session.suggestions.length > 0) return 'reviewed';
    return 'none';
  };

  // Handle tab change
  const handleTabChange = (tab: SpecTab) => {
    setActiveTab(tab);
  };

  // Handle edit toggle
  const handleToggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  // Handle content change in editor
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  // Handle save
  const handleSave = useCallback(async (newContent?: string) => {
    if (!selectedPath) return;
    const contentToSave = newContent ?? content;

    try {
      await fetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentToSave }),
      });
      setOriginalContent(contentToSave);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save spec:', err);
    }
  }, [selectedPath, content, apiUrl]);

  // Handle start review (or re-review with existing session)
  const handleStartReview = async (reuseSession: boolean = false) => {
    if (!selectedPath) return;

    setIsStartingReview(true);
    try {
      const requestBody: Record<string, unknown> = { specFile: selectedPath };

      // If re-reviewing, pass the existing session ID to preserve chat history
      if (reuseSession && session?.sessionId) {
        requestBody.sessionId = session.sessionId;
      }

      const res = await fetch(apiUrl('/api/spec-review/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      // Poll for completion
      const sessionId = data.sessionId;
      let completed = false;
      while (!completed) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(apiUrl(`/api/spec-review/status/${sessionId}`));
        const statusData = await statusRes.json();
        if (statusData.status === 'completed' || statusData.status === 'error') {
          completed = true;
          // Refresh session data
          const sessionRes = await fetch(apiUrl(`/api/sessions/spec/${encodeURIComponent(selectedPath)}`));
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            setSession(sessionData.session || null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to start review:', err);
    } finally {
      setIsStartingReview(false);
    }
  };

  // Handle review diff for a suggestion
  const handleReviewDiff = (suggestion: Suggestion) => {
    // Apply suggestion to generate proposed text
    // For now, just show original vs original + suggested fix
    const proposedContent = applySuggestion(content, suggestion);

    setDiffOverlay({
      isOpen: true,
      suggestion,
      originalText: content,
      proposedText: proposedContent,
    });
  };

  // Simple suggestion application (real implementation would be smarter)
  const applySuggestion = (text: string, suggestion: Suggestion): string => {
    // This is a placeholder - in reality, you'd use the suggestion's location
    // to intelligently replace text
    return suggestion.suggestedFix || text;
  };

  // Handle diff approval
  const handleDiffApprove = async (finalContent: string) => {
    if (!diffOverlay.suggestion || !session) return;

    // Update content
    await handleSave(finalContent);

    // Mark suggestion as approved
    const updatedSuggestions = session.suggestions.map(s =>
      s.id === diffOverlay.suggestion?.id ? { ...s, status: 'approved' as const } : s
    );
    setSession({ ...session, suggestions: updatedSuggestions });

    // Close overlay
    setDiffOverlay({ isOpen: false, suggestion: null, originalText: '', proposedText: '' });
  };

  // Handle diff reject
  const handleDiffReject = () => {
    if (!diffOverlay.suggestion || !session) return;

    // Mark suggestion as rejected
    const updatedSuggestions = session.suggestions.map(s =>
      s.id === diffOverlay.suggestion?.id ? { ...s, status: 'rejected' as const } : s
    );
    setSession({ ...session, suggestions: updatedSuggestions });

    // Close overlay
    setDiffOverlay({ isOpen: false, suggestion: null, originalText: '', proposedText: '' });
  };

  // Handle sending chat message
  const handleSendChatMessage = useCallback(async (
    message: string,
    selectionContext?: string,
    suggestionId?: string
  ): Promise<void> => {
    if (!selectedPath) return;

    setIsSendingChat(true);
    try {
      const res = await fetch(apiUrl('/api/spec-review/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session?.sessionId,
          specPath: selectedPath, // Always pass specPath so backend can create session if needed
          message,
          suggestionId,
          selectedText: selectionContext,
        }),
      });

      const data = await res.json();

      if (data.success && data.userMessage && data.assistantMessage) {
        // Update session with new messages (or create local session if none existed)
        setSession(prev => {
          if (prev) {
            return {
              ...prev,
              chatMessages: [...prev.chatMessages, data.userMessage, data.assistantMessage],
            };
          }
          // Create local session state if backend created one
          return {
            sessionId: data.userMessage.id.split('-')[0], // Temporary ID, will refresh on next poll
            status: 'completed',
            suggestions: [],
            reviewResult: null,
            chatMessages: [data.userMessage, data.assistantMessage],
          };
        });
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
    } finally {
      setIsSendingChat(false);
    }
  }, [selectedPath, session?.sessionId, apiUrl]);

  // Handle discuss suggestion (from review tab)
  // Creates a "fresh chat" experience by:
  // 1. Setting a timestamp to hide previous messages visually
  // 2. Auto-sending a first message with the suggestion context
  // The backend session retains full history for Claude's context
  const handleDiscussSuggestion = useCallback(async (suggestion: Suggestion) => {
    // Mark the start of this discuss session (hides older messages from view)
    const now = new Date().toISOString();
    setDiscussStartTimestamp(now);

    setDiscussingContext({
      suggestionId: suggestion.id,
      issue: suggestion.issue,
      suggestedFix: suggestion.suggestedFix,
    });
    setIsChatOpen(true);

    // Auto-send the first message with suggestion context
    if (session?.sessionId) {
      const firstMessage = `Let's discuss this review item:\n\n**Issue:** ${suggestion.issue}\n\n**Suggested Fix:** ${suggestion.suggestedFix}`;

      setIsSendingChat(true);
      try {
        const res = await fetch(apiUrl('/api/spec-review/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            message: firstMessage,
            suggestionId: suggestion.id,
          }),
        });

        const data = await res.json();

        if (data.success && data.userMessage && data.assistantMessage) {
          setSession(prev => prev ? {
            ...prev,
            chatMessages: [...prev.chatMessages, data.userMessage, data.assistantMessage],
          } : prev);
        }
      } catch (error) {
        console.error('Failed to send discuss message:', error);
      } finally {
        setIsSendingChat(false);
      }
    }
  }, [session?.sessionId, apiUrl]);

  // Handle create new spec
  const handleOpenNewSpecModal = useCallback(() => {
    setNewSpecName('');
    setIsNewSpecModalOpen(true);
  }, []);

  const handleCreateNewSpec = useCallback(async () => {
    if (!newSpecName.trim()) return;

    setIsCreatingSpec(true);
    try {
      const res = await fetch(apiUrl('/api/spec-review/new'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSpecName.trim() }),
      });

      const data = await res.json();

      if (data.success && data.filePath) {
        // Refresh file tree
        const filesRes = await fetch(apiUrl('/api/spec-review/files'));
        const filesData = await filesRes.json();

        // Merge statuses
        const statusesRes = await fetch(apiUrl('/api/sessions/statuses'));
        const statusesData = await statusesRes.json();
        const filesWithStatus = mergeStatusesIntoTree(
          filesData.files || [],
          statusesData.statuses || {}
        );
        setFiles(filesWithStatus);

        // Select the new file
        setSelectedPath(data.filePath);

        // Close modal
        setIsNewSpecModalOpen(false);
        setNewSpecName('');
      } else {
        console.error('Failed to create spec:', data.error);
      }
    } catch (error) {
      console.error('Failed to create spec:', error);
    } finally {
      setIsCreatingSpec(false);
    }
  }, [newSpecName, apiUrl]);

  const handleCancelNewSpec = useCallback(() => {
    setIsNewSpecModalOpen(false);
    setNewSpecName('');
  }, []);

  // Render content based on active tab
  const renderTabContent = () => {
    if (isLoadingContent) {
      return <div className="spec-explorer-loading">Loading...</div>;
    }

    if (!selectedPath) {
      return (
        <div className="spec-explorer-empty">
          <p>Select a spec from the tree to view it</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'preview':
        return (
          <div className="spec-editor-container">
            <SpecEditor
              ref={editorRef}
              content={content}
              onChange={handleContentChange}
              readOnly={!isEditMode}
              className="spec-editor-inline"
            />
            <div className="spec-editor-toolbar">
              <div className="spec-editor-mode-toggle">
                <button
                  className={`mode-toggle-btn ${!isEditMode ? 'mode-toggle-btn--active' : ''}`}
                  onClick={() => setIsEditMode(false)}
                >
                  Preview
                </button>
                <button
                  className={`mode-toggle-btn ${isEditMode ? 'mode-toggle-btn--active' : ''}`}
                  onClick={() => setIsEditMode(true)}
                >
                  Edit
                </button>
              </div>
              {isEditMode && hasUnsavedChanges && (
                <button
                  className="spec-editor-save-btn"
                  onClick={() => handleSave()}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        );

      case 'decompose':
        return (
          <SpecDecomposeTab
            specPath={selectedPath}
            projectPath={projectPath}
          />
        );

      case 'review':
        return (
          <div className="spec-review-tab">
            {!session || isStartingReview ? (
              <div className="spec-review-start">
                <p>Start an AI review to get suggestions for improving this spec.</p>
                <button
                  className="spec-review-start-btn"
                  onClick={() => handleStartReview(false)}
                  disabled={isStartingReview}
                >
                  {isStartingReview ? 'Running Review...' : 'Start Review'}
                </button>
              </div>
            ) : session.status === 'in_progress' ? (
              <div className="spec-review-in-progress">
                <div className="spec-review-spinner"></div>
                <p>Running AI Review...</p>
                <p className="spec-review-hint">This may take 2-5 minutes as multiple prompts are analyzed.</p>
              </div>
            ) : (
              <div className="spec-review-results">
                <div className="spec-review-results-header">
                  <h3>Suggestions ({session.suggestions.filter(s => s.status === 'pending').length} pending)</h3>
                  <button
                    className="spec-review-rereview-btn"
                    onClick={() => handleStartReview(true)}
                    disabled={isStartingReview}
                    title="Run a fresh review (preserves chat history)"
                  >
                    🔄 Re-review
                  </button>
                </div>
                <div className="spec-review-suggestions">
                  {session.suggestions.map(suggestion => (
                    <div
                      key={suggestion.id}
                      className={`suggestion-card suggestion-card--${suggestion.severity} suggestion-card--${suggestion.status}`}
                    >
                      <div className="suggestion-card-header">
                        <span className={`suggestion-severity suggestion-severity--${suggestion.severity}`}>
                          {suggestion.severity}
                        </span>
                        {suggestion.status !== 'pending' && (
                          <span className={`suggestion-status suggestion-status--${suggestion.status}`}>
                            {suggestion.status}
                          </span>
                        )}
                      </div>
                      <p className="suggestion-issue">{suggestion.issue}</p>
                      {suggestion.status === 'pending' && (
                        <div className="suggestion-actions">
                          {suggestion.type !== 'comment' && (
                            <button
                              className="suggestion-btn suggestion-btn--review"
                              onClick={() => handleReviewDiff(suggestion)}
                            >
                              Review Diff
                            </button>
                          )}
                          <button
                            className="suggestion-btn suggestion-btn--discuss"
                            onClick={() => handleDiscussSuggestion(suggestion)}
                          >
                            Discuss
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="spec-explorer">
      {/* Tree Panel (Left) */}
      <div className="spec-explorer-tree">
        <SpecTree
          files={files}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          onCreateNew={handleOpenNewSpecModal}
        />
      </div>

      {/* Main Content Area (Right) */}
      <div className="spec-explorer-main">
        {selectedPath && (
          <SpecHeader
            fileName={selectedFileName}
            filePath={selectedPath}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onEdit={handleToggleEditMode}
            reviewStatus={getReviewStatus()}
            hasUnsavedChanges={hasUnsavedChanges}
            isEditMode={isEditMode}
          />
        )}

        <div className="spec-explorer-content">
          {renderTabContent()}
        </div>
      </div>

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
            className={`chat-toggle-btn ${isChatOpen ? 'chat-toggle-btn--open' : ''} ${(session?.chatMessages?.length ?? 0) > 0 ? 'chat-toggle-btn--has-messages' : ''}`}
            onClick={() => setIsChatOpen(!isChatOpen)}
            title={isChatOpen ? 'Close chat' : 'Open chat'}
          >
            {isChatOpen ? '✕' : '💬'}
            {!isChatOpen && (session?.chatMessages?.length ?? 0) > 0 && (
              <span className="chat-toggle-badge">{session?.chatMessages?.length}</span>
            )}
          </button>

          {/* Chat Popup Panel */}
          {isChatOpen && (
            <div className="chat-popup">
              <div className="chat-popup-header">
                <span className="chat-popup-title">Review Chat</span>
                <button
                  className="chat-popup-close"
                  onClick={() => setIsChatOpen(false)}
                >
                  ✕
                </button>
              </div>
              <ReviewChat
                messages={
                  // Filter to only show messages from the discuss start time (fresh chat view)
                  discussStartTimestamp && session?.chatMessages
                    ? session.chatMessages.filter(m => m.timestamp >= discussStartTimestamp)
                    : (session?.chatMessages ?? [])
                }
                sessionId={session?.sessionId}
                discussingContext={discussingContext}
                onSendMessage={handleSendChatMessage}
                onClearDiscussingContext={() => {
                  setDiscussingContext(null);
                  // Clear the fresh chat filter when context is cleared
                  setDiscussStartTimestamp(null);
                }}
                isSending={isSendingChat}
              />
            </div>
          )}
        </>
      )}

      {/* New Spec Modal */}
      {isNewSpecModalOpen && (
        <div className="new-spec-modal-overlay">
          <div className="new-spec-modal">
            <div className="new-spec-modal-header">
              <h3>Create New Spec</h3>
            </div>
            <div className="new-spec-modal-body">
              <label className="new-spec-modal-label">
                Spec Name
                <input
                  type="text"
                  className="new-spec-modal-input"
                  value={newSpecName}
                  onChange={(e) => setNewSpecName(e.target.value)}
                  placeholder="e.g., user-authentication, payment-flow"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSpecName.trim()) {
                      handleCreateNewSpec();
                    }
                    if (e.key === 'Escape') {
                      handleCancelNewSpec();
                    }
                  }}
                />
              </label>
              <p className="new-spec-modal-hint">
                File will be created as: specs/YYYYMMDD-HHMMSS-{newSpecName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'name'}.md
              </p>
            </div>
            <div className="new-spec-modal-footer">
              <button
                className="new-spec-modal-btn new-spec-modal-btn--cancel"
                onClick={handleCancelNewSpec}
                disabled={isCreatingSpec}
              >
                Cancel
              </button>
              <button
                className="new-spec-modal-btn new-spec-modal-btn--create"
                onClick={handleCreateNewSpec}
                disabled={!newSpecName.trim() || isCreatingSpec}
              >
                {isCreatingSpec ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
