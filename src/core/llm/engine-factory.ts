import type { Engine } from './engine.js';
import { detectCli } from '../cli-detect.js';
import { loadGlobalSettings } from '../settings.js';
import { ClaudeCliEngine } from './drivers/claude-cli.js';
import { CodexCliEngine } from './drivers/codex-cli.js';
import type { EnginePurpose, GlobalSettings } from '../../types/index.js';

/**
 * Engine factory for multi-engine LLM abstraction.
 * Selects engine based on CLI flags > env vars > global settings > auto detection.
 * This keeps callers vendor-agnostic; drivers handle agent-specific details.
 */

/** Engine selection: return a driver implementation by name. */
export function getEngineByName(name: string | undefined): Engine {
  switch (name) {
    case 'codex-cli':
    case 'codex':
      return new CodexCliEngine();
    case 'claude-cli':
    case 'claude':
    default:
      return new ClaudeCliEngine();
  }
}

export interface EngineSelection {
  engine: Engine;
  engineName: string;
  model?: string;
}

/**
 * Get purpose-specific settings from GlobalSettings.
 * Maps EnginePurpose to the correct settings object.
 */
function getPurposeSettings(
  settings: GlobalSettings,
  purpose?: EnginePurpose
): { agent?: string; model?: string } | undefined {
  switch (purpose) {
    case 'decompose':
      return settings.decompose?.reviewer;
    case 'specChat':
      return settings.specChat;
    case 'condenser':
      return settings.condenser;
    case 'specGenerator':
      return settings.specGenerator;
    case 'specReview':
      // Reuse specChat settings for spec review
      return settings.specChat;
    case 'taskRunner':
    default:
      return settings.taskRunner;
  }
}

/**
 * Resolve engine and model based on (priority):
 * CLI flags > env vars > project config > purpose settings > auto detection.
 */
export async function selectEngine(opts?: {
  engineName?: string;
  model?: string;
  projectPath?: string;
  purpose?: EnginePurpose;
}): Promise<EngineSelection> {
  const settings = await loadGlobalSettings();
  const envEngine = process.env.QALA_ENGINE;
  const envModel = process.env.QALA_MODEL;

  // Load project config if projectPath provided
  let projectConfig: import('../../types/index.js').ProjectConfig | null = null;
  if (opts?.projectPath) {
    try {
      const { Project } = await import('../project.js');
      const project = new Project(opts.projectPath);
      projectConfig = await project.loadConfig();
    } catch {
      // Project config not available - continue without it
    }
  }

  // Get purpose-specific settings
  const purposeSettings = getPurposeSettings(settings, opts?.purpose);

  // Precedence: CLI flags > env vars > project config > purpose settings > auto
  const engineName = opts?.engineName
    || envEngine
    || projectConfig?.llm?.engine
    || purposeSettings?.agent
    || 'auto';

  const model = opts?.model
    || envModel
    || projectConfig?.llm?.model
    || purposeSettings?.model;

  if (engineName === 'auto') {
    // Auto-select first available engine (Claude first for backwards-compat, then Codex)
    const claude = await detectCli('claude');
    if (claude.available) {
      return { engine: new ClaudeCliEngine(), engineName: 'claude-cli', model };
    }

    const codex = await detectCli('codex');
    if (codex.available) {
      return { engine: new CodexCliEngine(), engineName: 'codex-cli', model };
    }

    // Default to Claude even if not available (will error when used)
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
