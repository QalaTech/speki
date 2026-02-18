import { createContext, useContext, useCallback, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';

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
    const base = data.error || data.message || `Request failed: ${response.status}`;
    const message = data.details ? `${base}: ${data.details}` : base;
    dispatchError(message);
    throw new Error(message);
  }

  return response;
}

// Context for programmatic access within React
interface ErrorContextValue {
  showError: (message: string) => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function useGlobalError() {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error('useGlobalError must be used within ErrorProvider');
  return ctx;
}

export function ErrorProvider({ children }: { children: ReactNode }) {
  const showError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  // Listen for global error events
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ErrorEvent>;
      toast.error(customEvent.detail.message);
    };
    window.addEventListener(ERROR_EVENT, handler);
    return () => window.removeEventListener(ERROR_EVENT, handler);
  }, []);

  return (
    <ErrorContext.Provider value={{ showError }}>
      {children}
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
