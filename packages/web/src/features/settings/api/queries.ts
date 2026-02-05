import { useQuery } from '@tanstack/react-query';
import { settingsKeys } from './keys';
import { apiFetch } from '@/components/ui';
import type { GlobalSettings, AllCliDetectionResults, AllModelDetectionResults } from '@/types';

async function fetchSettings(): Promise<GlobalSettings> {
  const response = await apiFetch('/api/settings');
  return response.json();
}

async function fetchCliDetection(): Promise<AllCliDetectionResults> {
  const response = await apiFetch('/api/settings/cli/detect');
  const data = await response.json();

  // Sort: Available first, then alphabetically
  const sortedEntries = Object.entries(data).sort(([keyA, valA]: [any, any], [keyB, valB]: [any, any]) => {
    if (valA.available !== valB.available) {
      return valA.available ? -1 : 1;
    }
    return keyA.localeCompare(keyB);
  });

  return Object.fromEntries(sortedEntries) as unknown as AllCliDetectionResults;
}

async function fetchModelDetection(): Promise<AllModelDetectionResults> {
  const response = await apiFetch('/api/settings/models/detect');
  const data = await response.json();

  // Sort: Available first, then alphabetically
  const sortedEntries = Object.entries(data).sort(([keyA, valA]: [any, any], [keyB, valB]: [any, any]) => {
    if (valA.available !== valB.available) {
      return valA.available ? -1 : 1;
    }
    return keyA.localeCompare(keyB);
  });

  return Object.fromEntries(sortedEntries) as unknown as AllModelDetectionResults;
}

const SETTINGS_CACHE_KEY = 'speki-settings-cache';

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => {
      const response = await fetchSettings();
      try {
        sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(response));
      } catch (e) {}
      return response;
    },
    initialData: () => {
      try {
        const cached = sessionStorage.getItem(SETTINGS_CACHE_KEY);
        return cached ? JSON.parse(cached) : undefined;
      } catch (e) {
        return undefined;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

const CLI_CACHE_KEY = 'speki-cli-detection-cache';
const MODEL_CACHE_KEY = 'speki-model-detection-cache';

export function useCliDetection() {
  return useQuery({
    queryKey: settingsKeys.cliDetection,
    queryFn: async () => {
      const response = await fetchCliDetection();
      try {
        sessionStorage.setItem(CLI_CACHE_KEY, JSON.stringify(response));
      } catch (e) {
        console.warn('Failed to cache CLI detection', e);
      }
      return response;
    },
    initialData: () => {
      try {
        const cached = sessionStorage.getItem(CLI_CACHE_KEY);
        return cached ? JSON.parse(cached) : undefined;
      } catch (e) {
        return undefined;
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour - CLIs don't change often
  });
}

export function useModelDetection() {
  return useQuery({
    queryKey: settingsKeys.modelDetection,
    queryFn: async () => {
      const response = await fetchModelDetection();
      try {
        sessionStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(response));
      } catch (e) {
        console.warn('Failed to cache model detection', e);
      }
      return response;
    },
    initialData: () => {
      try {
        const cached = sessionStorage.getItem(MODEL_CACHE_KEY);
        return cached ? JSON.parse(cached) : undefined;
      } catch (e) {
        return undefined;
      }
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
