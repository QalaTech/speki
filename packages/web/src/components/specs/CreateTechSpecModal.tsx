import { useState, useEffect, useCallback } from 'react';
import type { UserStory } from '../../types';
import { apiFetch } from '../ui/ErrorContext';
import { Button } from '../ui/Button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
} from '../ui/Drawer';

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

  // Select all stories by default on initial open
  useEffect(() => {
    if (isOpen && selectedStories.size === 0 && userStories.length > 0) {
      setSelectedStories(new Set(userStories.map(s => s.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userStories.length]); // Only depend on open state and length, not the selection size itself

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

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()} direction="right">
      <DrawerContent side="right" className="w-[500px] sm:w-[600px] p-0 h-full mt-0">
        <DrawerHeader className="px-6 py-4 border-b border-white/5 flex flex-row items-center justify-between">
          <DrawerTitle className="text-lg font-semibold text-foreground">Create Tech Spec</DrawerTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            onClick={onClose}
          >
            ✕
          </Button>
        </DrawerHeader>

        <DrawerBody className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* Tech spec name input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Tech Spec Name
            </label>
            <input
              type="text"
              className="w-full bg-muted/20 border border-border/40 rounded-lg py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              value={techSpecName}
              onChange={(e) => setTechSpecName(e.target.value)}
              placeholder="feature-name.tech.md"
              disabled={creating}
            />
            <p className="text-xs text-muted-foreground">
              Will be created in the specs/ directory with a link to {prdName}
            </p>
          </div>

          {/* User stories selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                User Stories to Implement
              </label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] uppercase font-bold tracking-wider rounded-full hover:bg-muted"
                  onClick={selectAll}
                >
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] uppercase font-bold tracking-wider rounded-full hover:bg-muted"
                  onClick={selectNone}
                >
                  None
                </Button>
              </div>
            </div>

            <div className="bg-black/40 rounded-xl border border-white/10 shadow-inner overflow-hidden ring-1 ring-white/5">
              <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-1">
                {userStories.map(story => (
                  <label
                    key={story.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                      selectedStories.has(story.id) 
                        ? 'bg-primary/10 border-primary/20 shadow-sm' 
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-border/60 text-primary focus:ring-primary/20"
                      checked={selectedStories.has(story.id)}
                      onChange={() => toggleStory(story.id)}
                      disabled={creating}
                    />
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px] font-bold">
                      {story.id}
                    </span>
                    <span className="flex-1 text-sm truncate text-foreground/90">{story.title}</span>
                    {story.passes && (
                      <span className="text-success text-xs font-bold">✓</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-right">
              {selectedStories.size} of {userStories.length} stories selected
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}
        </DrawerBody>

        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3 bg-muted/5">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={creating}
            className="rounded-full px-6"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={creating || !techSpecName.trim() || selectedStories.size === 0}
            isLoading={creating}
            className="rounded-full px-6 shadow-lg shadow-primary/20"
          >
            Generate Tech Spec
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
