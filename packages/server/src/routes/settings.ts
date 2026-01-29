/**
 * Settings Routes
 *
 * API endpoints for managing global settings.
 */

import { Router } from 'express';
import { loadGlobalSettings, saveGlobalSettings } from '@speki/core';
import { detectAllClis } from '@speki/core';
import type { CliType, GlobalSettings, ReasoningEffort } from '@speki/core';

const router = Router();

/**
 * Valid CLI types for the reviewer configuration
 */
const VALID_CLI_TYPES: CliType[] = ['codex', 'claude', 'gemini'];

/**
 * Valid reasoning effort levels for Codex
 */
const VALID_REASONING_EFFORTS: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

/**
 * Type guard to check if a value is a valid CliType
 */
function isValidCliType(value: unknown): value is CliType {
  return typeof value === 'string' && VALID_CLI_TYPES.includes(value as CliType);
}

/**
 * Type guard to check if a value is a valid ReasoningEffort
 */
function isValidReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && VALID_REASONING_EFFORTS.includes(value as ReasoningEffort);
}

/**
 * GET /api/settings
 * Returns current global settings
 */
router.get('/', async (req, res) => {
  try {
    const settings = await loadGlobalSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load settings',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/settings
 * Updates global settings
 *
 * Request body: {
 *   reviewer: { cli: 'codex' | 'claude' },
 *   execution: { keepAwake: boolean }
 * }
 * Response: { success: true, settings: { ... } }
 */
router.put('/', async (req, res) => {
  try {
    const body = req.body;

    // Validate request body exists
    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body',
        details: 'Request body must be a JSON object',
      });
    }

    // Load current settings to merge with updates
    const currentSettings = await loadGlobalSettings();

    // Build new settings by merging current with updates
    const settings: GlobalSettings = {
      decompose: {
        reviewer: {
          agent: body.decompose?.reviewer?.agent ?? currentSettings.decompose.reviewer.agent,
          model: body.decompose?.reviewer?.model ?? currentSettings.decompose.reviewer.model,
          reasoningEffort: body.decompose?.reviewer?.reasoningEffort ?? currentSettings.decompose.reviewer.reasoningEffort,
        },
      },
      condenser: {
        agent: body.condenser?.agent ?? currentSettings.condenser.agent,
        model: body.condenser?.model ?? currentSettings.condenser.model,
        reasoningEffort: body.condenser?.reasoningEffort ?? currentSettings.condenser.reasoningEffort,
      },
      specGenerator: {
        agent: body.specGenerator?.agent ?? currentSettings.specGenerator.agent,
        model: body.specGenerator?.model ?? currentSettings.specGenerator.model,
        reasoningEffort: body.specGenerator?.reasoningEffort ?? currentSettings.specGenerator.reasoningEffort,
      },
      taskRunner: {
        agent: body.taskRunner?.agent ?? currentSettings.taskRunner.agent,
        model: body.taskRunner?.model ?? currentSettings.taskRunner.model,
        reasoningEffort: body.taskRunner?.reasoningEffort ?? currentSettings.taskRunner.reasoningEffort,
      },
      specChat: {
        agent: body.specChat?.agent ?? currentSettings.specChat.agent,
        model: body.specChat?.model ?? currentSettings.specChat.model,
        reasoningEffort: body.specChat?.reasoningEffort ?? currentSettings.specChat.reasoningEffort,
      },
      execution: {
        keepAwake: body.execution?.keepAwake ?? currentSettings.execution.keepAwake,
      },
    };

    // Validate agent types (allow 'auto' for engine)
    const agentChecks = [
      { agent: settings.decompose.reviewer.agent, name: 'decompose.reviewer.agent' },
      { agent: settings.condenser.agent, name: 'condenser.agent' },
      { agent: settings.specGenerator.agent, name: 'specGenerator.agent' },
      { agent: settings.specChat.agent, name: 'specChat.agent' },
    ];

    for (const check of agentChecks) {
      if (!isValidCliType(check.agent)) {
        return res.status(400).json({
          error: `Invalid ${check.name} value`,
          details: `agent must be one of: ${VALID_CLI_TYPES.join(', ')}`,
        });
      }
    }

    // Task runner agent can be 'auto' or a valid CLI type
    const taskRunnerAgent: string = settings.taskRunner.agent;
    if (taskRunnerAgent !== 'auto' && !isValidCliType(taskRunnerAgent as any)) {
      return res.status(400).json({
        error: 'Invalid taskRunner.agent value',
        details: `agent must be one of: ${VALID_CLI_TYPES.join(', ')}, or 'auto'`,
      });
    }

    await saveGlobalSettings(settings);

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save settings',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/settings/cli/detect
 * Detects available CLI tools (Codex and Claude)
 *
 * Response: { codex: { available, version, command }, claude: { available, version, command } }
 */
router.get('/cli/detect', async (req, res) => {
  try {
    const results = await detectAllClis();
    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to detect CLI tools',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/settings/models/detect
 * Detects available models for all CLI tools
 *
 * Response: { codex: { available, models }, claude: { available, models } }
 */
router.get('/models/detect', async (req, res) => {
  try {
    const { detectAllModels } = await import('@speki/core');
    const results = await detectAllModels();
    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to detect models',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
