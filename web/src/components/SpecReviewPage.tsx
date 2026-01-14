import { useState, useEffect, useRef, useCallback } from 'react';
import type { SuggestionCard as SuggestionCardType, SpecReviewResult, GodSpecIndicators, SplitProposal, ChatMessage, SplitSpecRef } from '../../../src/types/index.js';
import { SpecEditor } from './SpecEditor';
import { SuggestionCard } from './SuggestionCard';
import { DiffApprovalBar } from './DiffApprovalBar';
import { BatchNavigation } from './BatchNavigation';
import { GodSpecWarning } from './GodSpecWarning';
import { SplitPreviewModal, type SplitPreviewFile } from './SplitPreviewModal';
import { ReviewChat } from './ReviewChat';
import { SplitNavigation } from './SplitNavigation';
import { MonacoDiffReview, type HunkAction } from './MonacoDiffReview';
import { useSpecEditor } from '../hooks/useSpecEditor';
import { useDiffApproval } from '../hooks/useDiffApproval';
import { useAgentFeedback } from '../hooks/useAgentFeedback';
import { useSplitPreview } from '../hooks/useSplitPreview';
import './SpecReviewPage.css';

interface SpecFile {
  name: string;
  path: string;
  content?: string;
}

interface SpecReviewPageProps {
  projectPath?: string;
}

export function SpecReviewPage({ projectPath }: SpecReviewPageProps): React.ReactElement {
  const [files, setFiles] = useState<SpecFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [specContent, setSpecContent] = useState<string>('');
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'in_progress' | 'completed' | 'needs_attention' | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionCardType[]>([]);
  const [reviewResult, setReviewResult] = useState<SpecReviewResult | null>(null);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastLoadedFileRef = useRef<string | null>(null);
  const isLoadingContentRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Editor and diff approval hooks
  const specEditor = useSpecEditor(specContent);
  const diffApproval = useDiffApproval();
  const agentFeedback = useAgentFeedback();
  const splitPreview = useSplitPreview();

  // God spec state
  const [godSpecIndicators, setGodSpecIndicators] = useState<GodSpecIndicators | null>(null);
  const [splitProposal, setSplitProposal] = useState<SplitProposal | null>(null);
  const [showGodSpecWarning, setShowGodSpecWarning] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Discussing context (when user clicks "Discuss" on a suggestion)
  const [discussingContext, setDiscussingContext] = useState<{
    suggestionId: string;
    issue: string;
    suggestedFix: string;
  } | null>(null);

  // Split navigation state
  const [splitSpecs, setSplitSpecs] = useState<SplitSpecRef[]>([]);
  const [parentSpecPath, setParentSpecPath] = useState<string | undefined>(undefined);

  const apiUrl = useCallback((endpoint: string): string => {
    if (!projectPath) return endpoint;
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Fetch spec files on mount
  useEffect(() => {
    const fetchFiles = async (): Promise<void> => {
      try {
        setLoading(true);
        const response = await fetch(apiUrl('/api/spec-review/files'));
        if (response.ok) {
          const data = await response.json();
          const fileList = data.files || [];
          setFiles(fileList);
          if (fileList.length > 0) {
            setSelectedFile(fileList[0].path);
          }
        }
      } catch (error) {
        console.error('Failed to fetch spec files:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [apiUrl]);

  // Load spec content when file is selected
  useEffect(() => {
    if (!selectedFile) return;

    // Guard against re-loading the same file
    if (lastLoadedFileRef.current === selectedFile) return;

    // Guard against concurrent loads
    if (isLoadingContentRef.current) return;

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    isLoadingContentRef.current = true;
    lastLoadedFileRef.current = selectedFile;
    setLoadingSession(true);

    const loadData = async (): Promise<void> => {
      try {
        const encodedPath = encodeURIComponent(selectedFile);

        // Load content
        const contentResponse = await fetch(
          apiUrl(`/api/spec-review/content/${encodedPath}`),
          { signal: controller.signal }
        );
        if (contentResponse.ok) {
          const data = await contentResponse.json();
          setSpecContent(data.content || '');
          specEditor.setContent(data.content || '');
        }

        // Load session
        const sessionResponse = await fetch(
          apiUrl(`/api/sessions/spec/${encodedPath}`),
          { signal: controller.signal }
        );
        console.log('[SpecReview] Session response status:', sessionResponse.status);
        if (sessionResponse.ok) {
          const data = await sessionResponse.json();
          console.log('[SpecReview] Session data:', { hasSession: !!data.session, status: data.session?.status, sessionId: data.session?.sessionId });
          if (data.session) {
            setSessionId(data.session.sessionId);
            setSessionStatus(data.session.status || null);
            setSuggestions(data.session.suggestions || []);
            setReviewResult(data.session.reviewResult || null);
            setChatMessages(data.session.chatMessages || []);

            // Set split navigation state
            setSplitSpecs(data.session.splitSpecs || []);
            setParentSpecPath(data.session.parentSpecPath);

            // Check for god spec indicators in review result
            const result = data.session.reviewResult;
            if (result?.verdict === 'SPLIT_RECOMMENDED') {
              setGodSpecIndicators(result.godSpecIndicators || null);
              setSplitProposal(result.splitProposal || null);
              setShowGodSpecWarning(true);
            } else {
              setGodSpecIndicators(null);
              setSplitProposal(null);
              setShowGodSpecWarning(false);
            }
          } else {
            // Reset state when no session
            setSessionId(null);
            setSessionStatus(null);
            setSuggestions([]);
            setReviewResult(null);
            setChatMessages([]);
            setSplitSpecs([]);
            setParentSpecPath(undefined);
            setGodSpecIndicators(null);
            setSplitProposal(null);
            setShowGodSpecWarning(false);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return; // Request was cancelled, ignore
        }
        console.error('Failed to load spec data:', error);
      } finally {
        isLoadingContentRef.current = false;
        setLoadingSession(false);
      }
    };

    loadData();

    return () => {
      controller.abort();
    };
    // Note: specEditor.setContent is stable (useCallback with []), so we don't need specEditor in deps
    // Including specEditor would cause infinite re-runs since it's a new object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, apiUrl]);

  // Poll for session updates when status is in_progress
  useEffect(() => {
    if (sessionStatus !== 'in_progress' || !selectedFile) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const encodedPath = encodeURIComponent(selectedFile);
        const response = await fetch(apiUrl(`/api/sessions/spec/${encodedPath}`));
        if (response.ok) {
          const data = await response.json();
          if (data.session && data.session.status !== 'in_progress') {
            // Review completed or errored
            setSessionStatus(data.session.status);
            setSuggestions(data.session.suggestions || []);
            setReviewResult(data.session.reviewResult || null);
            setChatMessages(data.session.chatMessages || []);

            // Check for god spec indicators
            const result = data.session.reviewResult;
            if (result?.verdict === 'SPLIT_RECOMMENDED') {
              setGodSpecIndicators(result.godSpecIndicators || null);
              setSplitProposal(result.splitProposal || null);
              setShowGodSpecWarning(true);
            }
          }
        }
      } catch (error) {
        console.error('Failed to poll session status:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [sessionStatus, selectedFile, apiUrl]);

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent): void => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    const clampedWidth = Math.max(20, Math.min(80, newWidth));
    setLeftPanelWidth(clampedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback((): void => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleFileChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newFile = e.target.value;
    // Reset the ref so the new file will be loaded
    if (newFile !== selectedFile) {
      lastLoadedFileRef.current = null;
    }
    setSelectedFile(newFile);
    diffApproval.reset();
  };

  // Handle Review Diff button click on a suggestion
  const handleReviewDiff = useCallback((suggestionId: string): void => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;

    diffApproval.enterDiffMode(suggestion, specEditor, specEditor.content);
  }, [suggestions, diffApproval, specEditor]);

  // Handle Show in Editor button click - uses DOM-based scrolling
  const handleShowInEditor = useCallback((suggestionId: string): void => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;

    // Find the editor content area
    const editorContent = document.querySelector('.spec-editor-content');
    if (!editorContent) return;

    // Try to find text to highlight and scroll to
    const textToFind = suggestion.textSnippet || suggestion.section;
    if (!textToFind) return;

    // Search for the text in the editor
    const walker = document.createTreeWalker(
      editorContent,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent?.includes(textToFind)) {
        const parentElement = node.parentElement;
        if (parentElement) {
          // Scroll to the element
          parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Add temporary highlight
          const originalBg = parentElement.style.backgroundColor;
          parentElement.style.backgroundColor = '#ffeb3b80';
          parentElement.style.transition = 'background-color 0.3s';

          setTimeout(() => {
            parentElement.style.backgroundColor = originalBg;
          }, 2000);
        }
        break;
      }
    }
  }, [suggestions]);

  // Handle Dismiss button click
  const handleDismiss = useCallback((suggestionId: string): void => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId ? { ...s, status: 'rejected' as const } : s
      )
    );
  }, []);

  // Handle Discuss button click - scroll to chat with suggestion context
  const handleDiscussSuggestion = useCallback((suggestionId: string): void => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;

    // Set context for chat
    setDiscussingContext({
      suggestionId,
      issue: suggestion.issue,
      suggestedFix: suggestion.suggestedFix,
    });

    // Scroll to chat section
    const chatSection = document.querySelector('[data-testid="review-chat-section"]');
    chatSection?.scrollIntoView({ behavior: 'smooth' });
  }, [suggestions]);

  // Save file to disk
  const handleSaveFile = useCallback(async (content: string): Promise<void> => {
    if (!selectedFile) return;

    const encodedPath = encodeURIComponent(selectedFile);
    const response = await fetch(apiUrl(`/api/spec-review/content/${encodedPath}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save file');
    }

    setSpecContent(content);
  }, [selectedFile, apiUrl]);

  // Diff approval action handlers
  const handleApprove = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await diffApproval.approve(sessionId, specEditor, handleSaveFile, projectPath);

    // Update suggestion status
    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: 'approved' as const }
            : s
        )
      );
    }
  }, [sessionId, diffApproval, specEditor, handleSaveFile, projectPath]);

  const handleReject = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await diffApproval.reject(sessionId, specEditor, projectPath);

    // Update suggestion status
    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: 'rejected' as const }
            : s
        )
      );
    }
  }, [sessionId, diffApproval, specEditor, projectPath]);

  const handleEdit = useCallback((): void => {
    diffApproval.startEdit();
  }, [diffApproval]);

  const handleApplyEdit = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await diffApproval.applyEdit(sessionId, specEditor, handleSaveFile, projectPath);

    // Update suggestion status
    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: 'edited' as const }
            : s
        )
      );
    }
  }, [sessionId, diffApproval, specEditor, handleSaveFile, projectPath]);

  const handleCancel = useCallback((): void => {
    diffApproval.cancel(specEditor);
  }, [diffApproval, specEditor]);

  // Monaco diff hunk handlers
  const handleAcceptHunk = useCallback((action: HunkAction): void => {
    console.log('[MonacoDiff] Accept hunk:', action.hunkId);
  }, []);

  const handleRejectHunk = useCallback((action: HunkAction): void => {
    console.log('[MonacoDiff] Reject hunk:', action.hunkId);
  }, []);

  const handleCommentHunk = useCallback((action: HunkAction): void => {
    console.log('[MonacoDiff] Comment on hunk:', action.hunkId);
    // TODO: Open comment dialog or add to chat
  }, []);

  const handleDiffOriginalChange = useCallback(async (content: string): Promise<void> => {
    // When user accepts a hunk, update diff state and save to disk
    try {
      // Update diff state to keep Monaco models in sync
      specEditor.updateDiffContent(content, specEditor.diffState.proposedContent);
      // Save to disk
      await handleSaveFile(content);
    } catch (error) {
      console.error('Failed to save after accepting hunk:', error);
    }
  }, [handleSaveFile, specEditor]);

  const handleDiffModifiedChange = useCallback((content: string): void => {
    // When user rejects a hunk, update diff state to keep Monaco models in sync
    specEditor.updateDiffContent(specEditor.diffState.originalContent, content);
  }, [specEditor]);

  const handleAllHunksResolved = useCallback((): void => {
    // All hunks have been accepted/rejected, exit diff mode
    console.log('[MonacoDiff] All hunks resolved');

    // Mark the current suggestion as handled
    if (diffApproval.currentSuggestion) {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === diffApproval.currentSuggestion?.id
            ? { ...s, status: 'approved' as const }
            : s
        )
      );
    }

    // Exit diff mode
    diffApproval.cancel(specEditor);
  }, [diffApproval, specEditor]);

  // Handle editor content changes
  const handleEditorChange = useCallback((content: string): void => {
    specEditor.setContent(content);
  }, [specEditor]);

  // Filter pending suggestions - only show critical and warning severity
  const pendingSuggestions = suggestions.filter(
    (s) => s.status === 'pending' && (s.severity === 'critical' || s.severity === 'warning')
  );

  // Batch navigation: navigate to a suggestion and enter diff mode
  const handleBatchNavigate = useCallback((index: number): void => {
    if (index < 0 || index >= pendingSuggestions.length) return;

    setCurrentSuggestionIndex(index);
    const suggestion = pendingSuggestions[index];

    // Enter diff mode for the selected suggestion
    diffApproval.enterDiffMode(suggestion, specEditor, specEditor.content);
  }, [pendingSuggestions, diffApproval, specEditor]);

  // Batch approve all pending suggestions
  const handleApproveAll = useCallback(async (): Promise<void> => {
    if (!sessionId || pendingSuggestions.length === 0) return;

    setIsBatchProcessing(true);

    try {
      // Mark all pending suggestions as approved
      const approvedIds = pendingSuggestions.map((s) => s.id);

      // Send approval feedback for each suggestion
      for (const suggestion of pendingSuggestions) {
        await agentFeedback.sendApprovalFeedback(sessionId, suggestion.id, projectPath);
      }

      // Update all suggestions to approved status
      setSuggestions((prev) =>
        prev.map((s) =>
          approvedIds.includes(s.id) ? { ...s, status: 'approved' as const } : s
        )
      );

      // Exit diff mode if active
      if (diffApproval.isActive) {
        diffApproval.cancel(specEditor);
      }

      // Reset index
      setCurrentSuggestionIndex(0);
    } catch (error) {
      console.error('Failed to approve all suggestions:', error);
    } finally {
      setIsBatchProcessing(false);
    }
  }, [sessionId, pendingSuggestions, agentFeedback, diffApproval, specEditor, projectPath]);

  // Batch reject all pending suggestions
  const handleRejectAll = useCallback(async (): Promise<void> => {
    if (!sessionId || pendingSuggestions.length === 0) return;

    setIsBatchProcessing(true);

    try {
      // Mark all pending suggestions as rejected
      const rejectedIds = pendingSuggestions.map((s) => s.id);

      // Send rejection feedback for each suggestion
      for (const suggestion of pendingSuggestions) {
        await agentFeedback.sendRejectionFeedback(sessionId, suggestion.id, projectPath);
      }

      // Update all suggestions to rejected status
      setSuggestions((prev) =>
        prev.map((s) =>
          rejectedIds.includes(s.id) ? { ...s, status: 'rejected' as const } : s
        )
      );

      // Exit diff mode if active
      if (diffApproval.isActive) {
        diffApproval.cancel(specEditor);
      }

      // Reset index
      setCurrentSuggestionIndex(0);
    } catch (error) {
      console.error('Failed to reject all suggestions:', error);
    } finally {
      setIsBatchProcessing(false);
    }
  }, [sessionId, pendingSuggestions, agentFeedback, diffApproval, specEditor, projectPath]);

  // Selection change handler - update selection when user selects text in editor
  const handleEditorMouseUp = useCallback((): void => {
    // Small delay to ensure selection is complete
    setTimeout(() => {
      specEditor.updateSelection();
    }, 10);
  }, [specEditor]);

  // Clear selection when clicking outside editor
  const handleEditorBlur = useCallback((): void => {
    // Don't clear immediately - allow click on chat input
    setTimeout(() => {
      const activeElement = document.activeElement;
      const chatInput = document.querySelector('[data-testid="chat-input"]');
      if (activeElement !== chatInput) {
        specEditor.clearSelection();
      }
    }, 100);
  }, [specEditor]);

  // Chat message handler
  const handleSendMessage = useCallback(async (message: string, selectionContext?: string, suggestionId?: string): Promise<void> => {
    if (!sessionId) return;

    setIsSendingMessage(true);
    try {
      const response = await fetch(apiUrl('/api/spec-review/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message,
          selectedText: selectionContext,
          suggestionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Add both user and assistant messages to the chat
      const newMessages: ChatMessage[] = [];
      if (data.userMessage) {
        newMessages.push(data.userMessage);
      }
      if (data.assistantMessage) {
        newMessages.push(data.assistantMessage);
      }

      if (newMessages.length > 0) {
        setChatMessages((prev) => [...prev, ...newMessages]);
      }

      // Clear selection after sending
      specEditor.clearSelection();
    } catch (error) {
      console.error('Failed to send chat message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  }, [sessionId, apiUrl, specEditor]);

  // God spec handlers
  const handleAcceptSplit = useCallback(async (proposal: SplitProposal): Promise<void> => {
    if (!selectedFile) return;
    await splitPreview.openPreview(proposal, selectedFile, projectPath);
  }, [selectedFile, projectPath, splitPreview]);

  const handleModifySplit = useCallback(async (proposal: SplitProposal): Promise<void> => {
    if (!selectedFile) return;
    await splitPreview.openPreview(proposal, selectedFile, projectPath);
  }, [selectedFile, projectPath, splitPreview]);

  const handleSkipSplit = useCallback((): void => {
    setShowGodSpecWarning(false);
  }, []);

  const handleSplitSaveAll = useCallback(async (files: SplitPreviewFile[]): Promise<void> => {
    if (!selectedFile) return;
    await splitPreview.saveAll(files, selectedFile, sessionId || undefined, projectPath);
    setShowGodSpecWarning(false);
  }, [selectedFile, sessionId, projectPath, splitPreview]);

  const handleSplitCancel = useCallback((): void => {
    splitPreview.cancel();
  }, [splitPreview]);

  // Handle navigation to related spec (parent or child from split)
  const handleSpecNavigate = useCallback((specPath: string): void => {
    const isRelativeFilename = !specPath.includes('/');
    const resolvedPath = isRelativeFilename && selectedFile
      ? `${selectedFile.substring(0, selectedFile.lastIndexOf('/'))}/${specPath}`
      : specPath;

    // Reset the ref so the new file will be loaded
    lastLoadedFileRef.current = null;
    setSelectedFile(resolvedPath);
    diffApproval.reset();
  }, [selectedFile, diffApproval]);

  // Start a new review
  const handleStartReview = useCallback(async (): Promise<void> => {
    console.log('[SpecReview] handleStartReview called', { selectedFile, isStartingReview });
    if (!selectedFile || isStartingReview) {
      console.log('[SpecReview] Early return - no file or already reviewing');
      return;
    }

    setIsStartingReview(true);
    setReviewError(null);

    try {
      console.log('[SpecReview] Starting review for:', selectedFile);
      const url = apiUrl('/api/spec-review/start');
      console.log('[SpecReview] Fetching:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFile: selectedFile }),
      });

      console.log('[SpecReview] Response status:', response.status);
      const data = await response.json();
      console.log('[SpecReview] Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start review');
      }

      // Set session ID from response
      setSessionId(data.sessionId);

      // Load the full session to get suggestions and review result
      const sessionResponse = await fetch(apiUrl(`/api/spec-review/status/${data.sessionId}`));
      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        setSessionStatus(sessionData.status || 'completed');
        setSuggestions(sessionData.suggestions || []);
        setReviewResult(sessionData.reviewResult || null);

        // Check for god spec indicators
        if (sessionData.reviewResult?.verdict === 'SPLIT_RECOMMENDED') {
          setGodSpecIndicators(sessionData.reviewResult.godSpecIndicators || null);
          setSplitProposal(sessionData.reviewResult.splitProposal || null);
          setShowGodSpecWarning(true);
        }
      }
    } catch (error) {
      console.error('Failed to start review:', error);
      setReviewError(error instanceof Error ? error.message : 'Failed to start review');
    } finally {
      setIsStartingReview(false);
    }
  }, [selectedFile, isStartingReview, apiUrl]);

  if (loading) {
    return (
      <div className="spec-review-page" data-testid="spec-review-page">
        <div className="spec-review-loading">Loading spec files...</div>
      </div>
    );
  }

  // Determine view mode based on diff state
  // Monaco diff is now used instead of MDXEditor diff mode

  return (
    <div className="spec-review-page" data-testid="spec-review-page">
      <header className="spec-review-header">
        <h1>Spec Review</h1>
        <div className="spec-review-controls">
          <label htmlFor="file-select" className="file-select-label">
            Spec File:
          </label>
          <select
            id="file-select"
            className="file-selector"
            value={selectedFile}
            onChange={handleFileChange}
            data-testid="file-selector"
            disabled={diffApproval.isActive}
          >
            {files.length === 0 ? (
              <option value="">No spec files found</option>
            ) : (
              files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.name}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      {/* Split navigation banners */}
      <SplitNavigation
        splitSpecs={splitSpecs}
        parentSpecPath={parentSpecPath}
        onNavigate={handleSpecNavigate}
      />

      {/* Diff approval bar - shown when in diff mode */}
      <DiffApprovalBar
        isVisible={diffApproval.isActive}
        suggestionIssue={diffApproval.currentSuggestion?.issue}
        isLoading={diffApproval.isLoading}
        onApprove={diffApproval.isEditing ? handleApplyEdit : handleApprove}
        onReject={handleReject}
        onEdit={handleEdit}
        onCancel={handleCancel}
      />

      {diffApproval.error && (
        <div className="spec-review-error" data-testid="diff-error">
          {diffApproval.error}
        </div>
      )}

      <div
        ref={containerRef}
        className="spec-review-container"
        data-testid="split-view"
      >
        <div
          className="spec-review-panel left-panel"
          style={{ width: `${leftPanelWidth}%` }}
          data-testid="left-panel"
        >
          <div className="panel-header">
            <span className="panel-title">
              {diffApproval.isActive ? 'Review Changes' : 'Spec Editor'}
              {diffApproval.isActive && diffApproval.currentSuggestion && (
                <span className="diff-mode-indicator">
                  {' - '}{diffApproval.currentSuggestion.section || 'Change'}
                </span>
              )}
            </span>
            {diffApproval.isActive && (
              <button
                className="exit-diff-button"
                onClick={handleCancel}
                data-testid="exit-diff-button"
              >
                Exit Diff View
              </button>
            )}
          </div>
          <div
            className="panel-content"
            onMouseUp={diffApproval.isActive ? undefined : handleEditorMouseUp}
            onBlur={diffApproval.isActive ? undefined : handleEditorBlur}
          >
            {diffApproval.isActive ? (
              <MonacoDiffReview
                originalText={specEditor.diffState.originalContent}
                modifiedText={specEditor.diffState.proposedContent}
                language="markdown"
                onAcceptHunk={handleAcceptHunk}
                onRejectHunk={handleRejectHunk}
                onCommentHunk={handleCommentHunk}
                onOriginalChange={handleDiffOriginalChange}
                onModifiedChange={handleDiffModifiedChange}
                onAllResolved={handleAllHunksResolved}
              />
            ) : (
              <SpecEditor
                ref={specEditor.editorRef}
                content={specEditor.content}
                onChange={handleEditorChange}
                viewMode="rich-text"
                placeholder="Select a spec file to begin editing..."
              />
            )}
          </div>
        </div>

        <div
          className="resize-handle"
          onMouseDown={handleMouseDown}
          data-testid="resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={leftPanelWidth}
          aria-valuemin={20}
          aria-valuemax={80}
        />

        <div
          className="spec-review-panel right-panel"
          style={{ width: `${100 - leftPanelWidth}%` }}
          data-testid="right-panel"
        >
          <div className="panel-header">
            <span className="panel-title">Review Panel</span>
            {reviewResult && (
              <span className={`verdict-badge verdict-${reviewResult.verdict.toLowerCase()}`}>
                {reviewResult.verdict}
              </span>
            )}
          </div>
          <div className="panel-content">
            {/* God spec warning */}
            {showGodSpecWarning && godSpecIndicators && (
              <GodSpecWarning
                indicators={godSpecIndicators}
                splitProposal={splitProposal || undefined}
                onAcceptSplit={handleAcceptSplit}
                onModify={handleModifySplit}
                onSkip={handleSkipSplit}
              />
            )}

            {pendingSuggestions.length > 0 ? (
              <>
                <BatchNavigation
                  suggestions={pendingSuggestions}
                  currentIndex={currentSuggestionIndex}
                  onNavigate={handleBatchNavigate}
                  onApproveAll={handleApproveAll}
                  onRejectAll={handleRejectAll}
                  disabled={isBatchProcessing || diffApproval.isLoading}
                />
                <div className="suggestions-list" data-testid="suggestions-list">
                  {pendingSuggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onReviewDiff={handleReviewDiff}
                      onDiscuss={handleDiscussSuggestion}
                      onShowInEditor={handleShowInEditor}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="no-suggestions" data-testid="no-suggestions">
                {loadingSession ? (
                  <div className="loading-session" data-testid="loading-session">
                    <div className="review-spinner"></div>
                    <p className="review-status">Loading review data...</p>
                  </div>
                ) : isStartingReview || sessionStatus === 'in_progress' ? (
                  <div className="review-in-progress" data-testid="review-in-progress">
                    <div className="review-spinner"></div>
                    <p className="review-status">Running AI Review...</p>
                    <p className="review-hint">This may take 2-5 minutes as multiple prompts are analyzed.</p>
                  </div>
                ) : !reviewResult ? (
                  <>
                    <p>No review results yet.</p>
                    {reviewError && (
                      <p className="review-error" data-testid="review-error">
                        {reviewError}
                      </p>
                    )}
                    <button
                      className="start-review-button"
                      onClick={handleStartReview}
                      disabled={!selectedFile || isStartingReview}
                      data-testid="start-review-button"
                    >
                      {isStartingReview ? '⏳ Starting...' : 'Start Review'}
                    </button>
                  </>
                ) : (
                  'All critical/warning suggestions have been reviewed.'
                )}
              </div>
            )}

            {/* Review Chat */}
            {sessionId && (
              <div className="review-chat-section" data-testid="review-chat-section">
                <div className="section-header">Chat</div>
                <ReviewChat
                  messages={chatMessages}
                  sessionId={sessionId}
                  selectedText={specEditor.selectedText || undefined}
                  discussingContext={discussingContext}
                  onSendMessage={handleSendMessage}
                  onClearDiscussingContext={() => setDiscussingContext(null)}
                  isSending={isSendingMessage}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Split preview modal */}
      {splitPreview.isOpen && splitPreview.proposal && (
        <SplitPreviewModal
          isOpen={splitPreview.isOpen}
          proposal={splitPreview.proposal}
          previewFiles={splitPreview.previewFiles}
          onSaveAll={handleSplitSaveAll}
          onCancel={handleSplitCancel}
          isSaving={splitPreview.isSaving}
        />
      )}
    </div>
  );
}
