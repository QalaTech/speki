import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import type { GlobalSettings } from '../types/index.js';

/**
 * Get the qala directory path (~/.qala)
 * Computed lazily to allow for testing
 */
export function getQalaDir(): string {
  const override = process.env.QALA_HOME;
  if (override && override.trim().length > 0) {
    return override;
  }
  return join(homedir(), '.qala');
}

/**
 * Get the settings file path (~/.qala/config.json)
 * Computed lazily to allow for testing
 */
export function getSettingsFilePath(): string {
  return join(getQalaDir(), 'config.json');
}

/**
 * Default global settings
 * - Claude as the default reviewer CLI (more widely available and capable)
 * - Keep awake enabled by default for overnight runs
 */
const DEFAULT_SETTINGS: GlobalSettings = {
  reviewer: {
    cli: 'claude',
  },
  execution: {
    keepAwake: true,
  },
};

/**
 * Load global settings from ~/.qala/config.json
 * Returns defaults when file is missing or corrupted
 */
export async function loadGlobalSettings(): Promise<GlobalSettings> {
  try {
    const content = await readFile(getSettingsFilePath(), 'utf-8');
    const parsed = JSON.parse(content);

    // Ensure the parsed object has the expected structure
    if (parsed && typeof parsed === 'object') {
      // Return merged settings with defaults for any missing properties
      return {
        reviewer: {
          cli: parsed.reviewer?.cli ?? DEFAULT_SETTINGS.reviewer.cli,
        },
        execution: {
          keepAwake: parsed.execution?.keepAwake ?? DEFAULT_SETTINGS.execution.keepAwake,
        },
      };
    }

    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    // File doesn't exist - return defaults silently
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_SETTINGS };
    }

    // JSON parse error or other issues - log warning and return defaults
    console.warn('Warning: Could not parse global settings file, using defaults:', (error as Error).message);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save global settings to ~/.qala/config.json
 * Creates the ~/.qala directory if it doesn't exist
 */
export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  // Ensure ~/.qala directory exists
  await mkdir(getQalaDir(), { recursive: true });

  // Write settings to file
  await writeFile(getSettingsFilePath(), JSON.stringify(settings, null, 2));
}
