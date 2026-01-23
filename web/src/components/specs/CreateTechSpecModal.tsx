import { useState, useEffect, useCallback } from 'react';
import type { UserStory } from '../../types';

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
      const res = await fetch(apiUrl('/api/decompose/generate-tech-spec'), {
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
      onGenerationEnd?.();
    } finally {
      setCreating(false);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

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

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div 
        className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center animate-[fadeIn_0.15s_ease-out]" 
        onClick={handleBackdropClick}
      >
        <div 
          className="w-[560px] max-w-[90vw] max-h-[80vh] bg-bg border border-border rounded-xl flex flex-col animate-[slideUp_0.2s_ease-out] shadow-[0_20px_40px_rgba(0,0,0,0.3)]" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between py-5 px-6 border-b border-border">
            <h2 className="m-0 text-lg font-semibold text-text">Create Tech Spec</h2>
            <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-md text-2xl text-text-muted cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:text-text" onClick={onClose}>×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Tech spec name input */}
            <div className="mb-5">
              <label className="block mb-2 text-[13px] font-semibold text-text uppercase tracking-[0.02em]">Tech Spec Name</label>
              <input
                type="text"
                className="w-full py-3 px-3.5 bg-surface border border-border rounded-lg font-mono text-sm text-text transition-all duration-150 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60 disabled:cursor-not-allowed"
                value={techSpecName}
                onChange={(e) => setTechSpecName(e.target.value)}
                placeholder="feature-name.tech.md"
                disabled={creating}
              />
              <span className="block mt-1.5 text-xs text-text-muted">
                Will be created in the specs/ directory with a link to {prdName}
              </span>
            </div>

            {/* User stories selection */}
            <div className="mb-5 last:mb-0">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[13px] font-semibold text-text uppercase tracking-[0.02em]">User Stories to Implement</label>
                <div className="flex gap-2">
                  <button className="py-1 px-2.5 bg-transparent border border-border rounded text-[11px] font-medium text-text-muted cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-accent hover:text-accent" onClick={selectAll}>Select All</button>
                  <button className="py-1 px-2.5 bg-transparent border border-border rounded text-[11px] font-medium text-text-muted cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-accent hover:text-accent" onClick={selectNone}>Select None</button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto p-1 bg-surface border border-border rounded-lg">
                {userStories.map(story => (
                  <label
                    key={story.id}
                    className={`flex items-center gap-2.5 py-2.5 px-3 bg-transparent rounded-md cursor-pointer transition-colors duration-150 hover:bg-surface-hover ${selectedStories.has(story.id) ? 'bg-accent/10' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-accent cursor-pointer"
                      checked={selectedStories.has(story.id)}
                      onChange={() => toggleStory(story.id)}
                      disabled={creating}
                    />
                    <span className="font-mono text-[11px] font-semibold text-text-muted bg-bg py-0.5 px-1.5 rounded shrink-0">{story.id}</span>
                    <span className="flex-1 text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{story.title}</span>
                    {story.passes && (
                      <span className="text-xs text-[#3fb950] shrink-0">✓</span>
                    )}
                  </label>
                ))}
              </div>

              <span className="block mt-1.5 text-xs text-text-muted">
                {selectedStories.size} of {userStories.length} stories selected
              </span>
            </div>

            {/* Error display */}
            {error && (
              <div className="flex items-center gap-2 py-3 px-3.5 bg-[rgba(218,54,51,0.1)] border border-[rgba(218,54,51,0.3)] rounded-lg text-[13px] text-[#f85149] mt-4">
                <span className="text-sm">⚠</span>
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 py-4 px-6 border-t border-border">
            <button
              className="inline-flex items-center gap-1.5 py-2.5 px-4.5 bg-surface-hover border border-border rounded-lg text-sm font-medium text-text cursor-pointer transition-all duration-150 hover:bg-surface hover:border-text-muted disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={onClose}
              disabled={creating}
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-1.5 py-2.5 px-4.5 bg-primary border-none rounded-lg text-sm font-medium text-white cursor-pointer transition-all duration-150 hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleCreate}
              disabled={creating || !techSpecName.trim() || selectedStories.size === 0}
            >
              {creating ? '⏳ Generating with AI...' : '🤖 Generate Tech Spec'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
