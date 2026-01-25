import { useState, useEffect, useCallback } from 'react';
import type { UserStory } from '../../types';
import { apiFetch } from '../ui/ErrorContext';

interface CreateTechSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  prdSpecId: string;
  prdName: string;
  userStories: UserStory[];
  onCreated?: (techSpecPath: string) => void;
  /** Callback when generation starts with spec name */
  onGenerationStart?: (specName: string) => void;
  /** Callback when generation ends (success or failure) */
  onGenerationEnd?: () => void;
}

export function CreateTechSpecModal({
  isOpen,
  onClose,
  projectPath,
  prdSpecId,
  prdName,
  userStories,
  onCreated,
  onGenerationStart,
  onGenerationEnd,
}: CreateTechSpecModalProps) {
  const [techSpecName, setTechSpecName] = useState('');
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate default tech spec name from PRD name
  useEffect(() => {
    if (isOpen && !techSpecName) {
      const baseName = prdName.replace(/\.prd\.md$/i, '').replace(/\.md$/i, '');
      setTechSpecName(`${baseName}.tech.md`);
    }
  }, [isOpen, prdName, techSpecName]);

  // Select all stories by default
  useEffect(() => {
    if (isOpen && selectedStories.size === 0 && userStories.length > 0) {
      setSelectedStories(new Set(userStories.map(s => s.id)));
    }
  }, [isOpen, userStories, selectedStories.size]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Toggle story selection
  const toggleStory = (storyId: string) => {
    setSelectedStories(prev => {
      const next = new Set(prev);
      if (next.has(storyId)) {
        next.delete(storyId);
      } else {
        next.add(storyId);
      }
      return next;
    });
  };

  // Select/deselect all
  const selectAll = () => {
    setSelectedStories(new Set(userStories.map(s => s.id)));
  };

  const selectNone = () => {
    setSelectedStories(new Set());
  };

  // Create tech spec using AI generation
  const handleCreate = async () => {
    if (!techSpecName.trim()) {
      setError('Please enter a tech spec name');
      return;
    }

    if (selectedStories.size === 0) {
      setError('Please select at least one user story');
      return;
    }

    setCreating(true);
    setError(null);

    // Notify parent that generation started with spec name, then close modal
    const specName = techSpecName.trim();
    onGenerationStart?.(specName);
    onClose();

    try {
      // Use AI-powered generation endpoint
      const res = await apiFetch(apiUrl('/api/decompose/generate-tech-spec'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prdSpecId,
          techSpecName: specName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle validation errors specially
        if (data.validationErrors) {
          const errorMessages = data.validationErrors
            .map((e: { field: string; error: string }) => `${e.field}: ${e.error}`)
            .join('\n');
          throw new Error(`Validation failed:\n${errorMessages}`);
        }
        throw new Error(data.error || 'Failed to generate tech spec');
      }

      onGenerationEnd?.();
      onCreated?.(data.outputPath);
    } catch (err) {
      console.error('Tech spec generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate tech spec');
      onGenerationEnd?.();
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-base-100 rounded-xl shadow-2xl border border-base-300 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-300 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-base-content">Create Tech Spec</h3>
          <button
            className="btn btn-sm btn-circle btn-ghost"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Tech spec name input */}
          <div>
            <label className="block text-sm font-medium text-base-content mb-2">
              Tech Spec Name
            </label>
            <input
              type="text"
              className="input input-bordered w-full font-mono"
              value={techSpecName}
              onChange={(e) => setTechSpecName(e.target.value)}
              placeholder="feature-name.tech.md"
              disabled={creating}
            />
            <p className="mt-2 text-xs text-base-content/60">
              Will be created in the specs/ directory with a link to {prdName}
            </p>
          </div>

          {/* User stories selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-base-content">
                User Stories to Implement
              </label>
              <div className="flex gap-2">
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={selectAll}
                >
                  Select All
                </button>
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={selectNone}
                >
                  Select None
                </button>
              </div>
            </div>

            <div className="bg-base-200 rounded-lg border border-base-300 max-h-48 overflow-y-auto p-2">
              {userStories.map(story => (
                <label
                  key={story.id}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-base-300 transition-colors ${
                    selectedStories.has(story.id) ? 'bg-primary/10' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={selectedStories.has(story.id)}
                    onChange={() => toggleStory(story.id)}
                    disabled={creating}
                  />
                  <span className="badge badge-ghost font-mono text-xs">{story.id}</span>
                  <span className="flex-1 text-sm truncate">{story.title}</span>
                  {story.passes && (
                    <span className="text-success text-xs">✓</span>
                  )}
                </label>
              ))}
            </div>

            <p className="mt-2 text-xs text-base-content/60">
              {selectedStories.size} of {userStories.length} stories selected
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-base-300 flex justify-end gap-3">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            className="btn btn-glass-primary"
            onClick={handleCreate}
            disabled={creating || !techSpecName.trim() || selectedStories.size === 0}
          >
            {creating ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Generating...
              </>
            ) : (
              'Generate Tech Spec'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
