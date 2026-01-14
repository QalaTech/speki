import { useState, useEffect, useCallback, useRef } from 'react';
import { SpecTree, type SpecFileNode } from './SpecTree';
import { SpecHeader, type SpecTab } from './SpecHeader';
import { SpecEditor, type SpecEditorRef } from '../SpecEditor';
import { SpecDecomposeTab } from './SpecDecomposeTab';
import { DiffOverlay } from './DiffOverlay';
import { ReviewChat, type DiscussingContext } from '../ReviewChat';
import { CreateTechSpecModal } from './CreateTechSpecModal';
import type { UserStory } from '../../types';
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
  const [newSpecType, setNewSpecType] = useState<'prd' | 'tech-spec' | 'bug'>('prd');
  const [isCreatingSpec, setIsCreatingSpec] = useState(false);

  // Create Tech Spec modal state
  const [isCreateTechSpecModalOpen, setIsCreateTechSpecModalOpen] = useState(false);
  const [prdUserStories, setPrdUserStories] = useState<UserStory[]>([]);

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
        setIsEditing(false); // Reset to preview mode when switching files
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

  // Detect spec type from filename
  const getSpecTypeFromFilename = (filename: string): 'prd' | 'tech-spec' | 'bug' => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.prd.md')) return 'prd';
    if (lower.endsWith('.tech.md')) return 'tech-spec';
    if (lower.endsWith('.bug.md')) return 'bug';
    return 'prd';
  };

  const selectedSpecType = getSpecTypeFromFilename(selectedFileName);

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

  // Handle content change in editor
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  // Refetch spec content (used when agent updates the file)
  const refetchContent = useCallback(async () => {
    if (!selectedPath) return;
    try {
      const res = await fetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath)}`));
      const data = await res.json();
      const fileContent = data.content || '';
      setContent(fileContent);
      setOriginalContent(fileContent);
      setHasUnsavedChanges(false);
      console.log('[SpecExplorer] Refetched spec content after agent update');
    } catch (err) {
      console.error('Failed to refetch spec content:', err);
    }
  }, [selectedPath, apiUrl]);

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

    // Optimistically add user message immediately
    const optimisticUserMessage = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
      suggestionId,
    };

    setSession(prev => {
      if (prev) {
        return {
          ...prev,
          chatMessages: [...prev.chatMessages, optimisticUserMessage],
        };
      }
      // Create local session state
      return {
        sessionId: `temp-${Date.now()}`,
        status: 'completed',
        suggestions: [],
        reviewResult: null,
        chatMessages: [optimisticUserMessage],
      };
    });

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

      if (data.success && data.assistantMessage) {
        // Check if agent updated the spec file
        if (data.assistantMessage.content?.includes('[SPEC_UPDATED]')) {
          console.log('[SpecExplorer] Detected [SPEC_UPDATED] marker, refetching content');
          refetchContent();
        }

        // Replace optimistic message with server version and add assistant response
        setSession(prev => {
          if (prev) {
            // Remove optimistic message and add server messages
            const messagesWithoutOptimistic = prev.chatMessages.filter(
              m => m.id !== optimisticUserMessage.id
            );
            return {
              ...prev,
              sessionId: data.sessionId || prev.sessionId,
              chatMessages: [...messagesWithoutOptimistic, data.userMessage, data.assistantMessage],
            };
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
      // Remove optimistic message on error
      setSession(prev => {
        if (prev) {
          return {
            ...prev,
            chatMessages: prev.chatMessages.filter(m => m.id !== optimisticUserMessage.id),
          };
        }
        return prev;
      });
    } finally {
      setIsSendingChat(false);
    }
  }, [selectedPath, session?.sessionId, apiUrl, refetchContent]);

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
    setNewSpecType('prd');
    setIsNewSpecModalOpen(true);
  }, []);

  const handleCreateNewSpec = useCallback(async () => {
    if (!newSpecName.trim()) return;

    setIsCreatingSpec(true);
    try {
      const res = await fetch(apiUrl('/api/spec-review/new'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSpecName.trim(), type: newSpecType }),
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
        setNewSpecType('prd');
      } else {
        console.error('Failed to create spec:', data.error);
      }
    } catch (error) {
      console.error('Failed to create spec:', error);
    } finally {
      setIsCreatingSpec(false);
    }
  }, [newSpecName, newSpecType, apiUrl]);

  const handleCancelNewSpec = useCallback(() => {
    setIsNewSpecModalOpen(false);
    setNewSpecName('');
    setNewSpecType('prd');
  }, []);

  // Handle opening Create Tech Spec modal for PRDs
  const handleOpenCreateTechSpec = useCallback(async () => {
    if (!selectedPath) return;

    // Fetch the PRD's user stories from decompose state
    try {
      const res = await fetch(apiUrl(`/api/decompose/draft?specPath=${encodeURIComponent(selectedPath)}`));
      const data = await res.json();

      if (data.draft?.userStories) {
        setPrdUserStories(data.draft.userStories);
        setIsCreateTechSpecModalOpen(true);
      } else {
        console.error('No user stories found - decompose the PRD first');
      }
    } catch (err) {
      console.error('Failed to fetch PRD user stories:', err);
    }
  }, [selectedPath, apiUrl]);

  // Handle tech spec created - navigate to it
  const handleTechSpecCreated = useCallback(async (techSpecPath: string) => {
    setIsCreateTechSpecModalOpen(false);

    // Refresh file tree
    try {
      const [filesRes, statusesRes] = await Promise.all([
        fetch(apiUrl('/api/spec-review/files')),
        fetch(apiUrl('/api/sessions/statuses')),
      ]);

      const filesData = await filesRes.json();
      const statusesData = await statusesRes.json();

      const filesWithStatus = mergeStatusesIntoTree(
        filesData.files || [],
        statusesData.statuses || {}
      );
      setFiles(filesWithStatus);

      // Navigate to the new tech spec
      setSelectedPath(techSpecPath);
    } catch (err) {
      console.error('Failed to refresh after tech spec creation:', err);
    }
  }, [apiUrl]);

  // Handle quick execute (PRD -> Tasks directly, skip tech spec)
  const handleQuickExecute = useCallback(async () => {
    if (!selectedPath) return;

    // Extract spec ID from path
    const specId = selectedPath.replace(/^.*\//, '').replace(/\.md$/, '');

    try {
      const res = await fetch(apiUrl('/api/queue/quick-start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Quick start failed:', data.error);
        return;
      }

      console.log(`Quick Start: Queued ${data.addedCount} stories as tasks`);

      // Navigate to queue view after queueing
      window.location.href = '/queue';
    } catch (err) {
      console.error('Quick start failed:', err);
    }
  }, [selectedPath, apiUrl]);

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
          <div className="spec-preview-layout">
            {/* Editor Panel (Left) */}
            <div className="spec-editor-panel">
              <div className="spec-editor-container">
                {/* Edit mode toolbar - top right */}
                <div className="spec-editor-header">
                  {!isEditing ? (
                    <button
                      className="spec-editor-edit-btn"
                      onClick={() => setIsEditing(true)}
                      title="Edit spec"
                    >
                      ✏️
                    </button>
                  ) : (
                    <div className="spec-editor-edit-actions">
                      <button
                        className="spec-editor-cancel-btn"
                        onClick={() => {
                          setIsEditing(false);
                          // Revert any unsaved changes
                          if (hasUnsavedChanges && editorRef.current) {
                            // Refetch original content
                            fetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath!)}`))
                              .then(res => res.json())
                              .then(data => {
                                setContent(data.content || '');
                                setHasUnsavedChanges(false);
                              });
                          }
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="spec-editor-save-btn"
                        onClick={() => {
                          handleSave();
                          setIsEditing(false);
                        }}
                        disabled={!hasUnsavedChanges}
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
                <SpecEditor
                  ref={editorRef}
                  content={content}
                  onChange={handleContentChange}
                  readOnly={!isEditing}
                  className="spec-editor-inline"
                />
              </div>
            </div>

            {/* Review Panel (Right) */}
            <div className="spec-review-panel">
              <div className="spec-review-panel-content">
                {!session && !isStartingReview ? (
                  // Empty state - no review yet
                  <div className="spec-review-empty">
                    <div className="spec-review-empty-icon">🔍</div>
                    <h4 className="spec-review-empty-title">AI Review</h4>
                    <p className="spec-review-empty-desc">
                      Get AI-powered suggestions to improve this spec
                    </p>
                    <button
                      className="spec-review-start-btn"
                      onClick={() => handleStartReview(false)}
                      disabled={isStartingReview}
                    >
                      Start Review
                    </button>
                  </div>
                ) : isStartingReview || session?.status === 'in_progress' ? (
                  // In progress state
                  <div className="spec-review-in-progress">
                    <div className="spec-review-spinner"></div>
                    <p>Running AI Review...</p>
                    <p className="spec-review-hint">This may take 2-5 minutes</p>
                  </div>
                ) : session ? (
                  // Has results
                  <div className="spec-review-results">
                    <div className="spec-review-panel-header">
                      <h4>Review ({session.suggestions.filter(s => s.status === 'pending').length} pending)</h4>
                      <button
                        className="spec-review-rereview-btn"
                        onClick={() => handleStartReview(true)}
                        disabled={isStartingReview}
                        title="Run a fresh review"
                      >
                        🔄
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
                                  Review
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
                ) : null}
              </div>
            </div>
          </div>
        );

      case 'decompose':
        return (
          <SpecDecomposeTab
            specPath={selectedPath}
            projectPath={projectPath}
            specType={selectedSpecType}
            onCreateTechSpec={handleOpenCreateTechSpec}
            onQuickExecute={handleQuickExecute}
          />
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
            onEdit={() => {}} // Unused - always in edit mode
            reviewStatus={getReviewStatus()}
            hasUnsavedChanges={hasUnsavedChanges}
            onCreateTechSpec={handleOpenCreateTechSpec}
            onQuickExecute={handleQuickExecute}
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
              {/* Type Selector */}
              <div className="new-spec-modal-label">Spec Type</div>
              <div className="new-spec-type-selector">
                <button
                  type="button"
                  className={`new-spec-type-btn ${newSpecType === 'prd' ? 'new-spec-type-btn--selected' : ''}`}
                  onClick={() => setNewSpecType('prd')}
                >
                  <span className="new-spec-type-icon">📋</span>
                  <span className="new-spec-type-name">PRD</span>
                  <span className="new-spec-type-desc">What &amp; Why</span>
                </button>
                <button
                  type="button"
                  className={`new-spec-type-btn ${newSpecType === 'tech-spec' ? 'new-spec-type-btn--selected' : ''}`}
                  onClick={() => setNewSpecType('tech-spec')}
                >
                  <span className="new-spec-type-icon">🔧</span>
                  <span className="new-spec-type-name">Tech Spec</span>
                  <span className="new-spec-type-desc">How</span>
                </button>
                <button
                  type="button"
                  className={`new-spec-type-btn ${newSpecType === 'bug' ? 'new-spec-type-btn--selected' : ''}`}
                  onClick={() => setNewSpecType('bug')}
                >
                  <span className="new-spec-type-icon">🐛</span>
                  <span className="new-spec-type-name">Bug</span>
                  <span className="new-spec-type-desc">Issue</span>
                </button>
              </div>

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
                File will be created as: specs/YYYYMMDD-HHMMSS-{newSpecName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'name'}.{newSpecType === 'prd' ? 'prd' : newSpecType === 'tech-spec' ? 'tech' : 'bug'}.md
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

      {/* Create Tech Spec Modal */}
      {isCreateTechSpecModalOpen && selectedPath && (
        <CreateTechSpecModal
          isOpen={isCreateTechSpecModalOpen}
          onClose={() => setIsCreateTechSpecModalOpen(false)}
          prdSpecId={selectedPath.replace(/^.*\//, '').replace(/\.md$/, '')}
          prdName={selectedFileName}
          userStories={prdUserStories}
          projectPath={projectPath}
          onCreated={handleTechSpecCreated}
        />
      )}
    </div>
  );
}
