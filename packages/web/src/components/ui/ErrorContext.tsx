import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { Modal } from './Modal';

// Event-based error system for use outside React components
const ERROR_EVENT = 'global-api-error';

interface ErrorEvent {
  message: string;
}

function dispatchError(message: string) {
  window.dispatchEvent(new CustomEvent<ErrorEvent>(ERROR_EVENT, { detail: { message } }));
}

// Global fetch wrapper - works anywhere (not just in React components)
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data.error || data.message || `Request failed: ${response.status}`;
    dispatchError(message);
    throw new Error(message);
  }

  return response;
}

// Context for programmatic access within React
interface ErrorContextValue {
  showError: (message: string) => void;
  clearError: () => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function useGlobalError() {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error('useGlobalError must be used within ErrorProvider');
  return ctx;
}

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Listen for global error events
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ErrorEvent>;
      setError(customEvent.detail.message);
    };
    window.addEventListener(ERROR_EVENT, handler);
    return () => window.removeEventListener(ERROR_EVENT, handler);
  }, []);

  return (
    <ErrorContext.Provider value={{ showError, clearError }}>
      {children}
      {error && (
        <Modal isOpen onClose={clearError} title="Error">
          <div className="text-red-400 whitespace-pre-wrap">{error}</div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={clearError}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded"
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </ErrorContext.Provider>
  );
}

// Hook version for React components (if they prefer hooks)
export function useApiFetch() {
  const { showError } = useGlobalError();

  return useCallback(async (url: string, options?: RequestInit) => {
    const response = await fetch(url, options);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data.error || data.message || `Request failed: ${response.status}`;
      showError(message);
      throw new Error(message);
    }

    return response;
  }, [showError]);
}
