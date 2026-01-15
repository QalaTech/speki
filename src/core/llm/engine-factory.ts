import type { Engine, EngineAvailability } from './engine.js';
import { detectCli } from '../cli-detect.js';

/**
 * Minimal engine factory
 * For now, auto-selects an available CLI engine.
 * - Prefers Claude CLI if detected (backwards-compat)
 * This keeps callers vendor-agnostic; drivers handle specifics.
 */

class ClaudeCliEngine implements Engine {
  name = 'cli-engine';
  async isAvailable(): Promise<EngineAvailability> {
    const d = await detectCli('claude');
    return { available: d.available, name: this.name, version: d.version };
  }
}

/**
 * Returns the default engine for this install.
 * Later, read from settings (.qala/config) and project config.
 */
export function getDefaultEngine(): Engine {
  // TODO: use settings.llm.defaultEngine; for now, return Claude driver wrapper
  return new ClaudeCliEngine();
}

/** Check if the default engine is available. */
export async function isDefaultEngineAvailable(): Promise<boolean> {
  const engine = getDefaultEngine();
  const res = await engine.isAvailable();
  return res.available;
}

