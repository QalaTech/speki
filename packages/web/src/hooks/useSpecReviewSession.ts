import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../components/ui/ErrorContext';
import type {
  SuggestionCard,
  SpecReviewResult,
  GodSpecIndicators,
  SplitProposal,
  ChatMessage,
  SplitSpecRef,
} from '@speki/core';

export interface ReviewSession {
  sessionId: string | null;
  status: 'in_progress' | 'completed' | 'needs_attention' | null;
  suggestions: SuggestionCard[];
  reviewResult: SpecReviewResult | null;
  chatMessages: ChatMessage[];
  splitSpecs: SplitSpecRef[];
  parentSpecPath?: string;
  godSpecIndicators: GodSpecIndicators | null;
  splitProposal: SplitProposal | null;
  showGodSpecWarning: boolean;
}

export interface UseSpecReviewSessionOptions {
  projectPath?: string;
  selectedFile: string;
}

export interface UseSpecReviewSessionReturn {
  // Session state
  session: ReviewSession;
  loadingSession: boolean;
  isStartingReview: boolean;
  reviewError: string | null;

  // Actions
  startReview: () => Promise<void>;
  setSuggestions: React.Dispatch<React.SetStateAction<SuggestionCard[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setShowGodSpecWarning: (show: boolean) => void;

  // API helper
  apiUrl: (endpoint: string) => string;
}

export function useSpecReviewSession({
  projectPath,
  selectedFile,
}: UseSpecReviewSessionOptions): UseSpecReviewSessionReturn {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'in_progress' | 'completed' | 'needs_attention' | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionCard[]>([]);
  const [reviewResult, setReviewResult] = useState<SpecReviewResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [splitSpecs, setSplitSpecs] = useState<SplitSpecRef[]>([]);
  const [parentSpecPath, setParentSpecPath] = useState<string | undefined>(undefined);

  // God spec state
  const [godSpecIndicators, setGodSpecIndicators] = useState<GodSpecIndicators | null>(null);
  const [splitProposal, setSplitProposal] = useState<SplitProposal | null>(null);
  const [showGodSpecWarning, setShowGodSpecWarning] = useState(false);

  // Loading states
  const [loadingSession, setLoadingSession] = useState(false);
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Refs
  const lastLoadedFileRef = useRef<string | null>(null);
  const isLoadingContentRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // API helper
  const apiUrl = useCallback((endpoint: string): string => {
    if (!projectPath) return endpoint;
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Reset session state when file changes
  const resetSession = useCallback(() => {
    setChatMessages([]);
    setSessionId(null);
    setSessionStatus(null);
    setSuggestions([]);
    setReviewResult(null);
    setSplitSpecs([]);
    setParentSpecPath(undefined);
    setGodSpecIndicators(null);
    setSplitProposal(null);
    setShowGodSpecWarning(false);
  }, []);

  // Load session data when file is selected
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

    // Clear state immediately when switching specs
    resetSession();

    const loadSession = async (): Promise<void> => {
      try {
        const encodedPath = encodeURIComponent(selectedFile);

        // Load session
        const sessionResponse = await apiFetch(
          apiUrl(`/api/sessions/spec/${encodedPath}`),
          { signal: controller.signal }
        );

        if (sessionResponse.ok) {
          const data = await sessionResponse.json();

          if (data.session) {
            setSessionId(data.session.sessionId);
            setSessionStatus(data.session.status || null);
            setSuggestions(data.session.suggestions || []);
            setReviewResult(data.session.reviewResult || null);
            setChatMessages(data.session.chatMessages || []);
            setSplitSpecs(data.session.splitSpecs || []);
            setParentSpecPath(data.session.parentSpecPath);

            // Check for god spec indicators in review result
            const result = data.session.reviewResult;
            if (result?.verdict === 'SPLIT_RECOMMENDED') {
              setGodSpecIndicators(result.godSpecIndicators || null);
              setSplitProposal(result.splitProposal || null);
              setShowGodSpecWarning(true);
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return; // Request was cancelled
        }
        console.error('Failed to load session data:', error);
      } finally {
        isLoadingContentRef.current = false;
        setLoadingSession(false);
      }
    };

    loadSession();

    return () => {
      controller.abort();
    };
  }, [selectedFile, apiUrl, resetSession]);

  // Poll for session updates when status is in_progress
  useEffect(() => {
    if (sessionStatus !== 'in_progress' || !selectedFile) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const encodedPath = encodeURIComponent(selectedFile);
        const response = await apiFetch(apiUrl(`/api/sessions/spec/${encodedPath}`));

        if (response.ok) {
          const data = await response.json();
          if (data.session && data.session.status !== 'in_progress') {
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
    }, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [sessionStatus, selectedFile, apiUrl]);

  // Start a new review
  const startReview = useCallback(async (): Promise<void> => {
    if (!selectedFile || isStartingReview) {
      return;
    }

    setIsStartingReview(true);
    setReviewError(null);

    try {
      const url = apiUrl('/api/spec-review/start');

      const response = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFile: selectedFile }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start review');
      }

      // Set session ID from response
      setSessionId(data.sessionId);

      // Load the full session to get suggestions and review result
      const sessionResponse = await apiFetch(apiUrl(`/api/spec-review/status/${data.sessionId}`));
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

  // Compose session object
  const session: ReviewSession = {
    sessionId,
    status: sessionStatus,
    suggestions,
    reviewResult,
    chatMessages,
    splitSpecs,
    parentSpecPath,
    godSpecIndicators,
    splitProposal,
    showGodSpecWarning,
  };

  return {
    session,
    loadingSession,
    isStartingReview,
    reviewError,
    startReview,
    setSuggestions,
    setChatMessages,
    setShowGodSpecWarning,
    apiUrl,
  };
}
