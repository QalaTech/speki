import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsKeys } from './keys';
import { apiFetch } from '../../../components/ui/ErrorContext';

interface StartRalphParams {
  project: string;
}

interface StopRalphParams {
  project: string;
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
