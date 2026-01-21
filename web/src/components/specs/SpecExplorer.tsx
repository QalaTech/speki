import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SpecTree, type SpecFileNode } from './SpecTree';
import { SpecHeader, type SpecTab } from './SpecHeader';
import { SpecEditor, type SpecEditorRef } from '../SpecEditor';
import { SpecDecomposeTab } from './SpecDecomposeTab';
import { DiffOverlay } from './DiffOverlay';
import { ReviewChat, type DiscussingContext } from '../ReviewChat';
import { CreateTechSpecModal } from './CreateTechSpecModal';
import { useFileVersion } from '../../hooks/useFileWatcher';
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

type SuggestionTag =
  | 'security'
  | 'performance'
  | 'scalability'
  | 'data'
  | 'api'
  | 'ux'
  | 'accessibility'
  | 'architecture'
  | 'testing'
  | 'infrastructure'
  | 'error-handling'
  | 'documentation';

interface Suggestion {
  id: string;
  type?: 'change' | 'comment';
  severity: 'critical' | 'warning' | 'info';
  // Data can come in two formats - handle both
  location?: { section: string; lineStart?: number; lineEnd?: number };
  section?: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  issue: string;
  suggestedFix: string;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  tags?: SuggestionTag[];
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
  // Use React Router's useSearchParams for URL state
  const [searchParams, setSearchParams] = useSearchParams();

  // Tree state
  const [files, setFiles] = useState<SpecFileNode[]>([]);
  const [selectedPath, setSelectedPathState] = useState<string | null>(
    () => searchParams.get('spec') || null
  );
  const [, setIsLoadingTree] = useState(true);

  // Wrapper to sync selectedPath with URL
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

  // Content state
  const [content, setContent] = useState<string>('');
  const [, setOriginalContent] = useState<string>('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // File watcher - triggers refetch when selected file changes on disk
  const fileVersion = useFileVersion(projectPath, selectedPath);

  // UI state
  const [activeTab, setActiveTab] = useState<SpecTab>('preview');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<SpecEditorRef>(null);

  // Session state (for review tab)
  const [session, setSession] = useState<SpecSession | null>(null);
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<SuggestionTag>>(new Set());

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
  const [isGeneratingTechSpec, setIsGeneratingTechSpec] = useState(false);
  const [generatingTechSpecInfo, setGeneratingTechSpecInfo] = useState<{
    parentPath: string;
    name: string;
  } | null>(null);

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

  // Fetch tree structure, statuses, and generation status
  useEffect(() => {
    async function fetchFilesAndStatuses() {
      setIsLoadingTree(true);
      try {
        // Fetch all in parallel
        const [filesRes, statusesRes, generationRes] = await Promise.all([
          fetch(apiUrl('/api/spec-review/files')),
          fetch(apiUrl('/api/sessions/statuses')),
          fetch(apiUrl('/api/decompose/generation-status')),
        ]);

        const filesData = await filesRes.json();
        const statusesData = await statusesRes.json();
        const generationData = await generationRes.json();

        // Merge statuses into tree
        const filesWithStatus = mergeStatusesIntoTree(
          filesData.files || [],
          statusesData.statuses || {}
        );
        setFiles(filesWithStatus);

        // Restore generation state if a generation is in progress
        if (generationData.generating) {
          setIsGeneratingTechSpec(true);
          setGeneratingTechSpecInfo({
            parentPath: `specs/${generationData.prdSpecId}.md`,
            name: generationData.techSpecName,
          });
        }

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

  // Poll for generation completion when generating
  useEffect(() => {
    if (!isGeneratingTechSpec) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl('/api/decompose/generation-status'));
        const data = await res.json();

        if (!data.generating) {
          // Generation completed - clear state and refresh file list
          setIsGeneratingTechSpec(false);
          setGeneratingTechSpecInfo(null);

          // Refresh file list to show the new spec
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
        }
      } catch (err) {
        console.error('Failed to poll generation status:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [isGeneratingTechSpec, apiUrl]);

  // Reset review state when file changes
  useEffect(() => {
    setIsStartingReview(false);
  }, [selectedPath]);

  // Fetch file content when selection changes
  useEffect(() => {
    if (!selectedPath) return;

    const abortController = new AbortController();
    let cancelled = false;

    async function fetchContent() {
      setIsLoadingContent(true);
      try {
        const res = await fetch(apiUrl(`/api/spec-review/content/${encodeURIComponent(selectedPath!)}`), {
          signal: abortController.signal,
        });

        if (cancelled) return; // Don't process if we've been cancelled

        const data = await res.json();
        const fileContent = data.content || '';
        setContent(fileContent);
        setOriginalContent(fileContent);
        setHasUnsavedChanges(false);
        setIsEditing(false); // Reset to preview mode when switching files
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }
        console.error('Failed to fetch spec content:', err);
      } finally {
        // Only clear loading if not cancelled (to avoid clearing new request's loading state)
        if (!cancelled) {
          setIsLoadingContent(false);
        }
      }
    }

    // Also fetch session if exists
    async function fetchSession() {
      try {
        const res = await fetch(apiUrl(`/api/sessions/spec/${encodeURIComponent(selectedPath!)}`), {
          signal: abortController.signal,
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          setSession(data.session || null);
        } else {
          setSession(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setSession(null);
      }
    }

    fetchContent();
    fetchSession();

    return () => {
      cancelled = true;
      abortController.abort();
      // Clear loading state immediately when switching files
      // This ensures we don't get stuck in loading state
      setIsLoadingContent(false);
    };
  }, [selectedPath, apiUrl, fileVersion]); // fileVersion triggers refetch when file changes on disk

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
    // Get location info from either root level or nested in location object
    const section = suggestion.section ?? suggestion.location?.section;
    const lineStart = suggestion.lineStart ?? suggestion.location?.lineStart;
    const lineEnd = suggestion.lineEnd ?? suggestion.location?.lineEnd;

    // If we have line numbers, try to insert at that location
    if (lineStart != null) {
      const lines = text.split('\n');
      const targetLineIndex = lineStart - 1; // Convert to 0-based index

      if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
        // Insert the suggested fix after the end line (or start line if no end)
        const insertIndex = (lineEnd ?? lineStart);
        
        // Add the suggested fix as a new section after the target location
        lines.splice(insertIndex, 0, '', suggestion.suggestedFix, '');
        return lines.join('\n');
      }
    }

    // If we have a section but no line numbers, try to find the section heading
    if (section) {
      const lines = text.split('\n');
      let sectionIndex = -1;

      // Find the section heading
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.toLowerCase().includes(section.toLowerCase())) {
          sectionIndex = i;
          break;
        }
      }

      if (sectionIndex >= 0) {
        // Find the end of this section (next heading or end of document)
        let sectionEndIndex = lines.length;
        for (let i = sectionIndex + 1; i < lines.length; i++) {
          if (lines[i].match(/^#{1,6}\s/)) {
            sectionEndIndex = i;
            break;
          }
        }

        // Insert the suggested fix at the end of the section
        lines.splice(sectionEndIndex, 0, '', suggestion.suggestedFix, '');
        return lines.join('\n');
      }
    }

    // Fallback: append to end of document
    return text + '\n\n' + suggestion.suggestedFix;
  };;

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

  // Handle suggestion status update (approve/reject/edit)
  const handleSuggestionAction = useCallback(async (
    suggestionId: string,
    action: 'approved' | 'rejected' | 'edited',
    userVersion?: string
  ) => {
    if (!session?.sessionId) return;

    // If approving, apply the suggestion to the spec first
    if (action === 'approved') {
      const suggestion = session.suggestions.find(s => s.id === suggestionId);
      if (suggestion) {
        const updatedContent = applySuggestion(content, suggestion);
        await handleSave(updatedContent);
        setContent(updatedContent);
      }
    }

    try {
      const res = await fetch(apiUrl('/api/spec-review/suggestion'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          suggestionId,
          action,
          userVersion,
        }),
      });

      if (!res.ok) {
        console.error('Failed to update suggestion status');
        return;
      }

      const data = await res.json();

      // Update local session state with the updated suggestion
      if (data.success && data.suggestion) {
        setSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            suggestions: prev.suggestions.map(s =>
              s.id === suggestionId ? { ...s, status: action, reviewedAt: data.suggestion.reviewedAt } : s
            ),
          };
        });
      }
    } catch (error) {
      console.error('Failed to update suggestion:', error);
    }
  }, [session?.sessionId, session?.suggestions, content, apiUrl, handleSave, applySuggestion]);;

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
      console.log('[SpecExplorer] Sending chat message:', {
        sessionId: session?.sessionId,
        specPath: selectedPath,
        messageLength: message.length,
      });

      // Send the message via POST to streaming endpoint
      const res = await fetch(apiUrl('/api/spec-review/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session?.sessionId,
          specPath: selectedPath,
          message,
          suggestionId,
          selectedText: selectionContext,
        }),
      });

      console.log('[SpecExplorer] Got response:', {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
      });

      // Read the SSE stream from response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      console.log('[SpecExplorer] Starting to read stream...');
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          console.log('[SpecExplorer] Stream chunk:', { done, valueLength: value?.length });
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          console.log('[SpecExplorer] Processing lines:', lines.length);
          for (const line of lines) {
            console.log('[SpecExplorer] Line:', line.substring(0, 100));
            if (line.startsWith('event: complete')) {
              console.log('[SpecExplorer] Got complete event');
              // Next line should be the data
              continue;
            }
            if (line.startsWith('data: ')) {
              const jsonData = line.substring(6); // Remove 'data: ' prefix
              console.log('[SpecExplorer] Parsing data:', jsonData.substring(0, 200));
              try {
                const data = JSON.parse(jsonData);
                console.log('[SpecExplorer] Parsed data:', {
                  success: data.success,
                  hasAssistantMessage: !!data.assistantMessage,
                });

                if (data.success && data.assistantMessage) {
                  // Check if agent updated the spec file
                  if (data.assistantMessage.content?.includes('[SPEC_UPDATED]')) {
                    console.log('[SpecExplorer] Detected [SPEC_UPDATED] marker, refetching content');
                    refetchContent();
                  }

                  // Replace optimistic message with server version and add assistant response
                  setSession(prev => {
                    if (prev) {
                      const messagesWithoutOptimistic = prev.chatMessages.filter(
                        m => m.id !== optimisticUserMessage.id
                      );
                      return {
                        ...prev,
                        sessionId: data.sessionId || prev.sessionId,
                        chatMessages: [...messagesWithoutOptimistic, data.userMessage, data.assistantMessage],
                      };
                    } else if (data.sessionId && data.userMessage && data.assistantMessage) {
                      // Create new session if none exists (first message)
                      return {
                        sessionId: data.sessionId,
                        status: 'completed' as const,
                        suggestions: [],
                        reviewResult: null,
                        chatMessages: [data.userMessage, data.assistantMessage],
                      };
                    }
                    return prev;
                  });
                }
              } catch (parseError) {
                // Ignore parse errors for non-complete events
              }
            }
          }
        }
        console.log('[SpecExplorer] Stream reading complete');
      } else {
        console.error('[SpecExplorer] No reader available from response');
      }
    } catch (error) {
      console.error('[SpecExplorer] Failed to send chat message:', error);
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
        const res = await fetch(apiUrl('/api/spec-review/chat/stream'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            message: firstMessage,
            suggestionId: suggestion.id,
          }),
        });

        // Read the SSE stream from response
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonData = line.substring(6);
                try {
                  const data = JSON.parse(jsonData);

                  if (data.success && data.userMessage && data.assistantMessage) {
                    setSession(prev => prev ? {
                      ...prev,
                      chatMessages: [...prev.chatMessages, data.userMessage, data.assistantMessage],
                    } : prev);
                  }
                } catch (parseError) {
                  // Ignore parse errors
                }
              }
            }
          }
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

      if (data.draft?.userStories && data.draft.userStories.length > 0) {
        setPrdUserStories(data.draft.userStories);
        setIsCreateTechSpecModalOpen(true);
      } else {
        // Show alert so user knows why modal didn't open
        alert('No user stories found. Please decompose the PRD first (use the Decompose tab).');
      }
    } catch (err) {
      console.error('Failed to fetch PRD user stories:', err);
      alert('Failed to load PRD data. Please try again.');
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
      window.location.href = '/execution/kanban';
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
                    {/* Verdict display */}
                    {session.reviewResult?.verdict && (
                      <div className={`spec-review-verdict spec-review-verdict--${session.reviewResult.verdict.toLowerCase()}`}>
                        {session.reviewResult.verdict === 'PASS' ? '✅' : session.reviewResult.verdict === 'FAIL' ? '❌' : '⚠️'}
                        <span>{session.reviewResult.verdict}</span>
                        {session.suggestions.length === 0 && session.reviewResult.verdict === 'PASS' && (
                          <span className="spec-review-verdict-note">No issues found</span>
                        )}
                      </div>
                    )}
                    {/* Tag filters */}
                    {(() => {
                      const allTags = new Set<SuggestionTag>();
                      session.suggestions.forEach(s => s.tags?.forEach(t => allTags.add(t)));
                      if (allTags.size === 0) return null;
                      return (
                        <div className="spec-review-tag-filters">
                          {Array.from(allTags).sort().map(tag => (
                            <button
                              key={tag}
                              className={`tag-filter-btn tag-filter-btn--${tag}${selectedTagFilters.has(tag) ? ' tag-filter-btn--active' : ''}`}
                              onClick={() => {
                                setSelectedTagFilters(prev => {
                                  const next = new Set(prev);
                                  if (next.has(tag)) {
                                    next.delete(tag);
                                  } else {
                                    next.add(tag);
                                  }
                                  return next;
                                });
                              }}
                            >
                              {tag}
                            </button>
                          ))}
                          {selectedTagFilters.size > 0 && (
                            <button
                              className="tag-filter-clear"
                              onClick={() => setSelectedTagFilters(new Set())}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    <div className="spec-review-suggestions">
                      {session.suggestions
                        .filter(suggestion => {
                          if (selectedTagFilters.size === 0) return true;
                          return suggestion.tags?.some(tag => selectedTagFilters.has(tag)) ?? false;
                        })
                        .map(suggestion => {
                          // Handle both data formats: root-level or nested in location
                          const section = suggestion.section ?? suggestion.location?.section;
                          const lineStart = suggestion.lineStart ?? suggestion.location?.lineStart;
                          const lineEnd = suggestion.lineEnd ?? suggestion.location?.lineEnd;
                          const hasLineInfo = lineStart != null;
                          const isClickable = section != null || hasLineInfo;

                          const handleCardClick = () => {
                            if (editorRef.current) {
                              // Prefer section-based scroll (more reliable), fallback to line-based
                              if (section) {
                                editorRef.current.scrollToSection(section);
                              } else if (hasLineInfo) {
                                editorRef.current.scrollToLine(lineStart!, lineEnd ?? undefined);
                              }
                            }
                          };

                          return (
                            <div
                              key={suggestion.id}
                              className={`suggestion-card suggestion-card--${suggestion.severity} suggestion-card--${suggestion.status}${isClickable ? ' suggestion-card--clickable' : ''}`}
                              onClick={isClickable ? handleCardClick : undefined}
                              role={isClickable ? 'button' : undefined}
                              tabIndex={isClickable ? 0 : undefined}
                              onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(); } : undefined}
                            >
                              <div className="suggestion-card-header">
                                <span className={`suggestion-severity suggestion-severity--${suggestion.severity}`}>
                                  {suggestion.severity}
                                </span>
                                {section && (
                                  <span className="suggestion-location">
                                    {section}
                                    {lineStart && (
                                      <span className="suggestion-lines">
                                        {lineEnd && lineEnd !== lineStart
                                          ? ` (L${lineStart}-${lineEnd})`
                                          : ` (L${lineStart})`}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {suggestion.status !== 'pending' && (
                                  <span className={`suggestion-status suggestion-status--${suggestion.status}`}>
                                    {suggestion.status}
                                  </span>
                                )}
                              </div>
                              {/* Tags */}
                              {suggestion.tags && suggestion.tags.length > 0 && (
                                <div className="suggestion-tags">
                                  {suggestion.tags.map(tag => (
                                    <span key={tag} className={`suggestion-tag suggestion-tag--${tag}`}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <p className="suggestion-issue">{suggestion.issue}</p>
                              {suggestion.status === 'pending' && (
                                <div className="suggestion-actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    className="suggestion-btn suggestion-btn--approve"
                                    onClick={() => handleSuggestionAction(suggestion.id, 'approved')}
                                    title="Mark as approved"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    className="suggestion-btn suggestion-btn--reject"
                                    onClick={() => handleSuggestionAction(suggestion.id, 'rejected')}
                                    title="Mark as rejected"
                                  >
                                    ✕ Reject
                                  </button>
                                  {suggestion.type !== 'comment' && (
                                    <button
                                      className="suggestion-btn suggestion-btn--review"
                                      onClick={() => handleReviewDiff(suggestion)}
                                      title="Review with diff"
                                    >
                                      Review
                                    </button>
                                  )}
                                  <button
                                    className="suggestion-btn suggestion-btn--discuss"
                                    onClick={() => handleDiscussSuggestion(suggestion)}
                                    title="Discuss with AI"
                                  >
                                    Discuss
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
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
            isGeneratingTechSpec={isGeneratingTechSpec}
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
          generatingSpec={generatingTechSpecInfo || undefined}
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
            isGeneratingTechSpec={isGeneratingTechSpec}
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
                projectPath={projectPath}
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
          onCreated={(path) => {
            handleTechSpecCreated(path);
            setGeneratingTechSpecInfo(null);
            setIsGeneratingTechSpec(false);
            // Navigate to the new spec
            setSelectedPath(path);
          }}
          onGenerationStart={(specName) => {
            setIsGeneratingTechSpec(true);
            setGeneratingTechSpecInfo({
              parentPath: selectedPath,
              name: specName,
            });
          }}
          onGenerationEnd={() => {
            setGeneratingTechSpecInfo(null);
            setIsGeneratingTechSpec(false);
          }}
        />
      )}
    </div>
  );
}
