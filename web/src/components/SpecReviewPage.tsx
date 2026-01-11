import { useState, useEffect, useRef, useCallback } from 'react';
import type { SuggestionCard as SuggestionCardType, SpecReviewResult } from '../../../src/types/index.js';
import { SpecEditor } from './SpecEditor';
import { SuggestionCard } from './SuggestionCard';
import { DiffApprovalBar } from './DiffApprovalBar';
import { BatchNavigation } from './BatchNavigation';
import { useSpecEditor } from '../hooks/useSpecEditor';
import { useDiffApproval } from '../hooks/useDiffApproval';
import { useAgentFeedback } from '../hooks/useAgentFeedback';
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionCardType[]>([]);
  const [reviewResult, setReviewResult] = useState<SpecReviewResult | null>(null);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Editor and diff approval hooks
  const specEditor = useSpecEditor(specContent);
  const diffApproval = useDiffApproval();
  const agentFeedback = useAgentFeedback();

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

    const loadContent = async (): Promise<void> => {
      try {
        const encodedPath = encodeURIComponent(selectedFile);
        const response = await fetch(apiUrl(`/api/spec-review/content/${encodedPath}`));
        if (response.ok) {
          const data = await response.json();
          setSpecContent(data.content || '');
          specEditor.setContent(data.content || '');
        }
      } catch (error) {
        console.error('Failed to load spec content:', error);
      }
    };

    const loadSession = async (): Promise<void> => {
      try {
        const encodedPath = encodeURIComponent(selectedFile);
        const response = await fetch(apiUrl(`/api/sessions/spec/${encodedPath}`));
        if (response.ok) {
          const data = await response.json();
          if (data.session) {
            setSessionId(data.session.sessionId);
            setSuggestions(data.session.suggestions || []);
            setReviewResult(data.session.reviewResult || null);
          }
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    };

    loadContent();
    loadSession();
  }, [selectedFile, apiUrl, specEditor]);

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
    setSelectedFile(e.target.value);
    diffApproval.reset();
  };

  // Handle Review Diff button click on a suggestion
  const handleReviewDiff = useCallback((suggestionId: string): void => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;

    diffApproval.enterDiffMode(suggestion, specEditor, specEditor.content);
  }, [suggestions, diffApproval, specEditor]);

  // Handle Show in Editor button click
  const handleShowInEditor = useCallback((suggestionId: string): void => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;

    if (suggestion.lineStart) {
      specEditor.scrollToLineNumber(suggestion.lineStart);
    } else if (suggestion.section) {
      specEditor.scrollToHeading(suggestion.section);
    }

    if (suggestion.textSnippet) {
      specEditor.highlight(suggestion.textSnippet, 2000);
    }
  }, [suggestions, specEditor]);

  // Handle Dismiss button click
  const handleDismiss = useCallback((suggestionId: string): void => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId ? { ...s, status: 'rejected' as const } : s
      )
    );
  }, []);

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

  // Handle editor content changes
  const handleEditorChange = useCallback((content: string): void => {
    specEditor.setContent(content);
  }, [specEditor]);

  // Filter pending suggestions
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

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

  if (loading) {
    return (
      <div className="spec-review-page" data-testid="spec-review-page">
        <div className="spec-review-loading">Loading spec files...</div>
      </div>
    );
  }

  // Determine view mode based on diff state
  const viewMode = diffApproval.isActive ? 'diff' : 'rich-text';

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
              Spec Editor
              {diffApproval.isActive && (
                <span className="diff-mode-indicator"> (Diff View)</span>
              )}
            </span>
          </div>
          <div className="panel-content">
            <SpecEditor
              ref={specEditor.editorRef}
              content={specEditor.content}
              onChange={handleEditorChange}
              viewMode={viewMode}
              placeholder="Select a spec file to begin editing..."
            />
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
                      onShowInEditor={handleShowInEditor}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="no-suggestions">
                {suggestions.length === 0
                  ? 'No review results yet. Start a review to see suggestions.'
                  : 'All suggestions have been reviewed.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
