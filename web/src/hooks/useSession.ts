import { useState, useCallback, useRef, useEffect } from 'react';

export type SessionStatus = 'in_progress' | 'completed' | 'needs_attention';

export interface ChangeHistoryEntry {
  id: string;
  timestamp: string;
  description: string;
  filePath: string;
  beforeContent: string;
  afterContent: string;
  reverted: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestionId?: string;
}

export interface SplitSpecRef {
  filename: string;
  description: string;
}

export interface SessionData {
  sessionId: string;
  specFilePath: string;
  status: SessionStatus;
  startedAt: string;
  lastUpdatedAt: string;
  completedAt?: string;
  suggestions: unknown[];
  changeHistory: ChangeHistoryEntry[];
  chatMessages: ChatMessage[];
  splitSpecs?: SplitSpecRef[];
  logPath?: string;
  contentHash?: string;
}

export interface UseSessionState {
  session: SessionData | null;
  isLoading: boolean;
  error: string | null;
  hasExternalChanges: boolean;
  showChangeDialog: boolean;
}

export interface UseSessionActions {
  loadSession: (specPath: string, projectPath?: string) => Promise<void>;
  saveSession: (projectPath?: string) => Promise<void>;
  updateSession: (updates: Partial<SessionData>) => void;
  handleContinue: () => void;
  handleStartFresh: () => void;
  dismissChangeDialog: () => void;
}

export type UseSessionReturn = UseSessionState & UseSessionActions;

const initialState: UseSessionState = {
  session: null,
  isLoading: false,
  error: null,
  hasExternalChanges: false,
  showChangeDialog: false,
};

function buildApiUrl(endpoint: string, projectPath?: string): string {
  if (!projectPath) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
}

async function computeContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function createNewSession(specPath: string, contentHash: string): SessionData {
  const now = new Date().toISOString();
  return {
    sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    specFilePath: specPath,
    status: 'in_progress',
    startedAt: now,
    lastUpdatedAt: now,
    suggestions: [],
    changeHistory: [],
    chatMessages: [],
    contentHash,
  };
}

export function useSession(): UseSessionReturn {
  const [state, setState] = useState<UseSessionState>(initialState);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectPathRef = useRef<string | undefined>(undefined);
  const pendingChangesRef = useRef<boolean>(false);
  const lastSavedHashRef = useRef<string | null>(null);

  const saveSession = useCallback(
    async (projectPath?: string): Promise<void> => {
      if (!state.session) return;

      const pathToUse = projectPath ?? projectPathRef.current;
      const encodedPath = encodeURIComponent(state.session.specFilePath);

      try {
        const sessionToSave = {
          ...state.session,
          lastUpdatedAt: new Date().toISOString(),
        };

        const response = await fetch(
          buildApiUrl(`/api/sessions/spec/${encodedPath}`, pathToUse),
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: sessionToSave }),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to save session');
        }

        pendingChangesRef.current = false;
        lastSavedHashRef.current = state.session.contentHash ?? null;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to save session',
        }));
      }
    },
    [state.session]
  );

  const scheduleAutoSave = useCallback((): void => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    pendingChangesRef.current = true;

    autoSaveTimerRef.current = setTimeout(() => {
      saveSession();
    }, 1000);
  }, [saveSession]);

  const updateSession = useCallback(
    (updates: Partial<SessionData>): void => {
      setState((prev) => {
        if (!prev.session) return prev;
        return {
          ...prev,
          session: {
            ...prev.session,
            ...updates,
            lastUpdatedAt: new Date().toISOString(),
          },
        };
      });

      scheduleAutoSave();
    },
    [scheduleAutoSave]
  );

  const loadSession = useCallback(
    async (specPath: string, projectPath?: string): Promise<void> => {
      projectPathRef.current = projectPath;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        hasExternalChanges: false,
        showChangeDialog: false,
      }));

      try {
        const encodedPath = encodeURIComponent(specPath);

        const [sessionResponse, specResponse] = await Promise.all([
          fetch(buildApiUrl(`/api/sessions/spec/${encodedPath}`, projectPath)),
          fetch(buildApiUrl(`/api/spec-review/files`, projectPath)).then((res) =>
            res.ok ? res.json() : null
          ),
        ]);

        let specContent = '';
        if (specResponse?.files) {
          const specFile = specResponse.files.find(
            (f: { path: string }) => f.path === specPath
          );
          if (specFile?.content) {
            specContent = specFile.content;
          }
        }

        if (!specContent) {
          const contentResponse = await fetch(
            buildApiUrl(`/api/spec-review/content/${encodedPath}`, projectPath)
          );
          if (contentResponse.ok) {
            const contentData = await contentResponse.json();
            specContent = contentData.content || '';
          }
        }

        const currentHash = specContent ? await computeContentHash(specContent) : '';

        const data = sessionResponse.ok ? await sessionResponse.json() : { session: null };

        if (!data.session) {
          const newSession = createNewSession(specPath, currentHash);
          setState((prev) => ({
            ...prev,
            session: newSession,
            isLoading: false,
          }));
          return;
        }

        const existingSession = data.session as SessionData;
        const storedHash = existingSession.contentHash;

        if (storedHash && currentHash && storedHash !== currentHash) {
          setState((prev) => ({
            ...prev,
            session: existingSession,
            isLoading: false,
            hasExternalChanges: true,
            showChangeDialog: true,
          }));
          lastSavedHashRef.current = storedHash;
        } else {
          setState((prev) => ({
            ...prev,
            session: {
              ...existingSession,
              contentHash: currentHash || existingSession.contentHash,
            },
            isLoading: false,
          }));
          lastSavedHashRef.current = currentHash || storedHash || null;
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load session',
        }));
      }
    },
    []
  );

  const handleContinue = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      showChangeDialog: false,
    }));
  }, []);

  const handleStartFresh = useCallback((): void => {
    if (!state.session) return;

    const currentHash = state.session.contentHash ?? '';
    const newSession = createNewSession(state.session.specFilePath, currentHash);

    setState((prev) => ({
      ...prev,
      session: newSession,
      hasExternalChanges: false,
      showChangeDialog: false,
    }));

    scheduleAutoSave();
  }, [state.session, scheduleAutoSave]);

  const dismissChangeDialog = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      showChangeDialog: false,
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  return {
    ...state,
    loadSession,
    saveSession,
    updateSession,
    handleContinue,
    handleStartFresh,
    dismissChangeDialog,
  };
}
