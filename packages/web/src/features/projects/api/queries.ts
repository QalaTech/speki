import { useQuery } from '@tanstack/react-query';
import { projectsKeys } from './keys';
import { apiFetch } from '../../../components/ui/ErrorContext';

export interface ProjectEntry {
  name: string;
  path: string;
  status: string;
  lastActivity: string;
  specCount?: number;
  activeSpec?: string;
  ralphStatus?: { completedTasks: number };
}

async function fetchProjects(): Promise<ProjectEntry[]> {
  const response = await apiFetch('/api/projects');
  return response.json();
}

/**
 * Hook to fetch the list of registered projects.
 * Note: The primary source of project data is SSE (via useProjectsSSE).
 * This query is used for initial data and fallback.
 */
export function useProjects() {
  return useQuery({
    queryKey: projectsKeys.all,
    queryFn: fetchProjects,
    // SSE will keep data fresh, so we can be more relaxed here
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
