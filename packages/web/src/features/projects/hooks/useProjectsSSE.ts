import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { projectsKeys } from '../api/keys';
import type { ProjectEntry } from '../api/queries';

/**
 * SSE subscription hook that keeps the projects query cache updated.
 * Listens to /api/events/projects for real-time updates.
 */
export function useProjectsSSE(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    // SSR check
    if (typeof window === 'undefined' || !('EventSource' in window)) {
      return;
    }

    const eventSource = new EventSource('/api/events/projects');

    const handleProjectsUpdate = (data: ProjectEntry[]) => {
      queryClient.setQueryData(projectsKeys.all, data);
    };

    const handleSnapshot = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        handleProjectsUpdate(payload.data);
      } catch (err) {
        console.error('[useProjectsSSE] Error processing projects/snapshot:', err);
      }
    };

    const handleUpdated = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        handleProjectsUpdate(payload.data);
      } catch (err) {
        console.error('[useProjectsSSE] Error processing projects/updated:', err);
      }
    };

    eventSource.addEventListener('projects/snapshot', handleSnapshot);
    eventSource.addEventListener('projects/updated', handleUpdated);

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient]);
}
