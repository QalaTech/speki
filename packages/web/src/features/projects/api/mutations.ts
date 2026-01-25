import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsKeys } from './keys';
import { apiFetch } from '../../../components/ui/ErrorContext';

interface StartRalphParams {
  project: string;
}

interface StopRalphParams {
  project: string;
}

export interface InitProjectParams {
  path: string;
  name?: string;
  branch?: string;
  language?: 'nodejs' | 'python' | 'dotnet' | 'go';
}

export interface InitProjectResult {
  success: boolean;
  path: string;
  name: string;
  branch: string;
  language: string;
}

async function initProject(params: InitProjectParams): Promise<InitProjectResult> {
  const response = await apiFetch('/api/projects/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

async function startRalph({ project }: StartRalphParams): Promise<void> {
  await apiFetch(
    `/api/ralph/start?project=${encodeURIComponent(project)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
}

async function stopRalph({ project }: StopRalphParams): Promise<void> {
  await apiFetch(
    `/api/ralph/stop?project=${encodeURIComponent(project)}`,
    { method: 'POST' }
  );
}

/**
 * Mutation hook to initialize a new project.
 * Invalidates project queries on success to refresh the list.
 */
export function useInitProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: initProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
    },
  });
}

/**
 * Mutation hook to start Ralph execution for a project.
 * Invalidates project queries on success to refresh state.
 */
export function useStartRalph() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startRalph,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
    },
  });
}

/**
 * Mutation hook to stop Ralph execution for a project.
 * Invalidates project queries on success to refresh state.
 */
export function useStopRalph() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stopRalph,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
    },
  });
}
