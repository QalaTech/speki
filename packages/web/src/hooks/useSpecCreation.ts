import { useState, useCallback } from 'react';
import { apiFetch } from '../components/ui/ErrorContext';
import type { UserStory } from '../types';
import type { SpecType } from '../components/specs/types';
import type { SpecFileNode } from '../components/specs/SpecTree';

interface UseSpecCreationOptions {
  projectPath: string;
  selectedPath: string | null;
  onFilesRefresh: () => Promise<SpecFileNode[] | void>;
  onSelectPath: (path: string) => void;
  onGenerationEnd: () => void;
}

interface UseSpecCreationReturn {
  // New spec modal
  isNewSpecModalOpen: boolean;
  newSpecName: string;
  setNewSpecName: (name: string) => void;
  newSpecType: SpecType;
  setNewSpecType: (type: SpecType) => void;
  isCreatingSpec: boolean;
  handleOpenNewSpecModal: () => void;
  handleCreateNewSpec: () => Promise<void>;
  handleCancelNewSpec: () => void;
  // Tech spec modal
  isCreateTechSpecModalOpen: boolean;
  prdUserStories: UserStory[];
  handleOpenCreateTechSpec: () => Promise<void>;
  handleTechSpecCreated: (techSpecPath: string) => Promise<void>;
  handleCloseTechSpecModal: () => void;
  // Quick execute
  handleQuickExecute: () => Promise<void>;
}

/**
 * Hook for managing spec creation workflows.
 */
export function useSpecCreation({
  projectPath,
  selectedPath,
  onFilesRefresh,
  onSelectPath,
  onGenerationEnd,
}: UseSpecCreationOptions): UseSpecCreationReturn {
  // New spec modal state
  const [isNewSpecModalOpen, setIsNewSpecModalOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecType, setNewSpecType] = useState<SpecType>('prd');
  const [isCreatingSpec, setIsCreatingSpec] = useState(false);

  // Create Tech Spec modal state
  const [isCreateTechSpecModalOpen, setIsCreateTechSpecModalOpen] = useState(false);
  const [prdUserStories, setPrdUserStories] = useState<UserStory[]>([]);

  // API helper
  const apiUrl = useCallback((endpoint: string) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}project=${encodeURIComponent(projectPath)}`;
  }, [projectPath]);

  // Handle create new spec modal
  const handleOpenNewSpecModal = useCallback(() => {
    setNewSpecName('');
    setNewSpecType('prd');
    setIsNewSpecModalOpen(true);
  }, []);

  const handleCreateNewSpec = useCallback(async () => {
    if (!newSpecName.trim()) return;

    setIsCreatingSpec(true);
    try {
      const res = await apiFetch(apiUrl('/api/spec-review/new'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSpecName.trim(), type: newSpecType }),
      });

      const data = await res.json();

      if (data.success && data.filePath) {
        // Refresh file tree
        await onFilesRefresh();

        // Select the new file
        onSelectPath(data.filePath);

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
  }, [newSpecName, newSpecType, apiUrl, onFilesRefresh, onSelectPath]);

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
      const res = await apiFetch(apiUrl(`/api/decompose/draft?specPath=${encodeURIComponent(selectedPath)}`));
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

    // Refresh file tree and navigate to the new tech spec
    await onFilesRefresh();
    onSelectPath(techSpecPath);
    onGenerationEnd();
  }, [onFilesRefresh, onSelectPath, onGenerationEnd]);

  const handleCloseTechSpecModal = useCallback(() => {
    setIsCreateTechSpecModalOpen(false);
  }, []);

  // Handle quick execute (PRD -> Tasks directly, skip tech spec)
  const handleQuickExecute = useCallback(async () => {
    if (!selectedPath) return;

    // Extract spec ID from path
    const specId = selectedPath.replace(/^.*\//, '').replace(/\.md$/, '');

    try {
      const res = await apiFetch(apiUrl('/api/queue/quick-start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId }),
      });

      const data = await res.json();
      console.log(`Quick Start: Queued ${data.addedCount} stories as tasks`);

      // Navigate to queue view after queueing
      window.location.href = '/execution/kanban';
    } catch (err) {
      console.error('Quick start failed:', err);
    }
  }, [selectedPath, apiUrl]);

  return {
    // New spec modal
    isNewSpecModalOpen,
    newSpecName,
    setNewSpecName,
    newSpecType,
    setNewSpecType,
    isCreatingSpec,
    handleOpenNewSpecModal,
    handleCreateNewSpec,
    handleCancelNewSpec,
    // Tech spec modal
    isCreateTechSpecModalOpen,
    prdUserStories,
    handleOpenCreateTechSpec,
    handleTechSpecCreated,
    handleCloseTechSpecModal,
    // Quick execute
    handleQuickExecute,
  };
}
