import { useState, useEffect, useCallback } from 'react';
import type { UserStory } from '../../types';
import './CreateTechSpecModal.css';

interface CreateTechSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  prdSpecId: string;
  prdName: string;
  userStories: UserStory[];
  onCreated?: (techSpecPath: string) => void;
}

export function CreateTechSpecModal({
  isOpen,
  onClose,
  projectPath,
  prdSpecId,
  prdName,
  userStories,
  onCreated,
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

  // Create tech spec
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

    try {
      const res = await fetch(apiUrl('/api/decompose/create-tech-spec'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prdSpecId,
          techSpecName: techSpecName.trim(),
          userStoryIds: Array.from(selectedStories),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create tech spec');
      }

      onCreated?.(data.techSpecPath);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tech spec');
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
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create Tech Spec</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Tech spec name input */}
          <div className="modal-field">
            <label className="modal-label">Tech Spec Name</label>
            <input
              type="text"
              className="modal-input"
              value={techSpecName}
              onChange={(e) => setTechSpecName(e.target.value)}
              placeholder="feature-name.tech.md"
              disabled={creating}
            />
            <span className="modal-hint">
              Will be created in the specs/ directory with a link to {prdName}
            </span>
          </div>

          {/* User stories selection */}
          <div className="modal-field">
            <div className="modal-label-row">
              <label className="modal-label">User Stories to Implement</label>
              <div className="modal-label-actions">
                <button className="modal-select-btn" onClick={selectAll}>Select All</button>
                <button className="modal-select-btn" onClick={selectNone}>Select None</button>
              </div>
            </div>

            <div className="modal-stories">
              {userStories.map(story => (
                <label
                  key={story.id}
                  className={`modal-story ${selectedStories.has(story.id) ? 'modal-story--selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedStories.has(story.id)}
                    onChange={() => toggleStory(story.id)}
                    disabled={creating}
                  />
                  <span className="modal-story-id">{story.id}</span>
                  <span className="modal-story-title">{story.title}</span>
                  {story.passes && (
                    <span className="modal-story-done">✓</span>
                  )}
                </label>
              ))}
            </div>

            <span className="modal-hint">
              {selectedStories.size} of {userStories.length} stories selected
            </span>
          </div>

          {/* Error display */}
          {error && (
            <div className="modal-error">
              <span className="modal-error-icon">⚠</span>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="modal-btn modal-btn--secondary"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            className="modal-btn modal-btn--primary"
            onClick={handleCreate}
            disabled={creating || !techSpecName.trim() || selectedStories.size === 0}
          >
            {creating ? '⏳ Creating...' : '🔧 Create Tech Spec'}
          </button>
        </div>
      </div>
    </div>
  );
}
