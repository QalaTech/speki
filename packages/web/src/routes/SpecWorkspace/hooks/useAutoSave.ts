import { useState, useEffect, useCallback } from 'react';

interface UseAutoSaveOptions {
  content: string;
  hasUnsavedChanges: boolean;
  onSave: () => Promise<void>;
  debounceMs?: number;
}

interface UseAutoSaveReturn {
  lastSavedAt: Date | null;
  isSaving: boolean;
  formattedLastSaved: string;
  triggerSave: () => Promise<void>;
}

/**
 * Hook to manage auto-save functionality with debouncing
 */
export function useAutoSave({
  content,
  hasUnsavedChanges,
  onSave,
  debounceMs = 1000,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [, setForceUpdate] = useState(0);

  // Update relative time display every 10 seconds
  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => setForceUpdate(x => x + 1), 10000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // Auto-save with debounce
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await onSave();
        setLastSavedAt(new Date());
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [content, hasUnsavedChanges, onSave, debounceMs]);

  const triggerSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    setIsSaving(true);
    try {
      await onSave();
      setLastSavedAt(new Date());
    } finally {
      setIsSaving(false);
    }
  }, [hasUnsavedChanges, onSave]);

  const formattedLastSaved = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return {
    lastSavedAt,
    isSaving,
    formattedLastSaved,
    triggerSave,
  };
}
