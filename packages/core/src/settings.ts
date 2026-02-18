import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import type { GlobalSettings } from './types/index.js';

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
 * - Claude as the default reviewer for all stages
 * - Keep awake enabled by default for overnight runs
 * - Medium reasoning effort as default for Codex
 */
const DEFAULT_SETTINGS: GlobalSettings = {
  decompose: {
    reviewer: {
      agent: 'claude',
      model: undefined,
      reasoningEffort: 'medium',
    },
  },
  condenser: {
    agent: 'claude',
    model: undefined,
    reasoningEffort: 'medium',
  },
  specGenerator: {
    agent: 'claude',
    model: undefined,
    reasoningEffort: 'medium',
  },
  taskRunner: {
    agent: 'auto',
    model: undefined,
    reasoningEffort: 'medium',
  },
  specChat: {
    agent: 'claude',
    model: undefined,
    reasoningEffort: 'medium',
  },
  execution: {
    keepAwake: true,
    parallel: {
      enabled: false,
      maxParallel: 2,
    },
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
        decompose: {
          reviewer: {
            agent: parsed.decompose?.reviewer?.agent ?? DEFAULT_SETTINGS.decompose.reviewer.agent,
            model: parsed.decompose?.reviewer?.model ?? DEFAULT_SETTINGS.decompose.reviewer.model,
            reasoningEffort: parsed.decompose?.reviewer?.reasoningEffort ?? DEFAULT_SETTINGS.decompose.reviewer.reasoningEffort,
          },
        },
        condenser: {
          agent: parsed.condenser?.agent ?? DEFAULT_SETTINGS.condenser.agent,
          model: parsed.condenser?.model ?? DEFAULT_SETTINGS.condenser.model,
          reasoningEffort: parsed.condenser?.reasoningEffort ?? DEFAULT_SETTINGS.condenser.reasoningEffort,
        },
        specGenerator: {
          agent: parsed.specGenerator?.agent ?? DEFAULT_SETTINGS.specGenerator.agent,
          model: parsed.specGenerator?.model ?? DEFAULT_SETTINGS.specGenerator.model,
          reasoningEffort: parsed.specGenerator?.reasoningEffort ?? DEFAULT_SETTINGS.specGenerator.reasoningEffort,
        },
        taskRunner: {
          agent: parsed.taskRunner?.agent ?? DEFAULT_SETTINGS.taskRunner.agent,
          model: parsed.taskRunner?.model ?? DEFAULT_SETTINGS.taskRunner.model,
          reasoningEffort: parsed.taskRunner?.reasoningEffort ?? DEFAULT_SETTINGS.taskRunner.reasoningEffort,
        },
        specChat: {
          agent: parsed.specChat?.agent ?? DEFAULT_SETTINGS.specChat.agent,
          model: parsed.specChat?.model ?? DEFAULT_SETTINGS.specChat.model,
          reasoningEffort: parsed.specChat?.reasoningEffort ?? DEFAULT_SETTINGS.specChat.reasoningEffort,
        },
        execution: {
          keepAwake: parsed.execution?.keepAwake ?? DEFAULT_SETTINGS.execution.keepAwake,
          parallel: {
            enabled: parsed.execution?.parallel?.enabled ?? DEFAULT_SETTINGS.execution.parallel!.enabled,
            maxParallel: parsed.execution?.parallel?.maxParallel ?? DEFAULT_SETTINGS.execution.parallel!.maxParallel,
          },
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
