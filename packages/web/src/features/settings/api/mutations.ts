import { useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsKeys } from './keys';
import { apiFetch } from '@/components/ui';
import type { GlobalSettings } from '@/types';

async function updateSettings(settings: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const response = await apiFetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to update settings');
  return data.settings;
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (newSettings) => {
      // Update the cache with the new settings
      queryClient.setQueryData(settingsKeys.all, newSettings);
      // Also invalidate to be sure
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
