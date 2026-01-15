import type { Engine } from './engine.js';
import { detectCli } from '../cli-detect.js';
import { loadGlobalSettings } from '../settings.js';
import { ClaudeCliEngine } from './drivers/claude-cli.js';

/**
 * Minimal engine factory
 * For now, auto-selects an available CLI engine.
 * - Prefers Claude CLI if detected (backwards-compat)
 * This keeps callers vendor-agnostic; drivers handle specifics.
 */

/** Engine selection: return a driver implementation by name. */
export function getEngineByName(name: string | undefined): Engine {
  // For now, only 'claude-cli' is implemented; default to it.
  return new ClaudeCliEngine();
}

export interface EngineSelection {
  engine: Engine;
  engineName: string;
  model?: string;
}

/**
 * Resolve engine and model based on (priority): CLI flags > env vars > global settings > auto detection.
 */
export async function selectEngine(opts?: { engineName?: string; model?: string }): Promise<EngineSelection> {
  const settings = await loadGlobalSettings();
  const envEngine = process.env.QALA_ENGINE;
  const envModel = process.env.QALA_MODEL;
  const engineName = opts?.engineName || envEngine || settings.llm?.defaultEngine || 'auto';
  const model = opts?.model || envModel || settings.llm?.defaultModel;

  if (engineName === 'auto') {
    const c = await detectCli('claude');
    if (c.available) {
      return { engine: new ClaudeCliEngine(), engineName: 'claude-cli', model };
    }
    return { engine: new ClaudeCliEngine(), engineName: 'claude-cli', model };
  }

  return { engine: getEngineByName(engineName), engineName, model };
}

/** Check if the default engine is available. */
export async function isDefaultEngineAvailable(): Promise<boolean> {
  const { engine } = await selectEngine();
  const res = await engine.isAvailable();
  return res.available;
}
