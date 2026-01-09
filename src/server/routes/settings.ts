/**
 * Settings Routes
 *
 * API endpoints for managing global settings.
 */

import { Router } from 'express';
import { loadGlobalSettings, saveGlobalSettings } from '../../core/settings.js';
import { detectAllClis } from '../../core/cli-detect.js';
import type { CliType, GlobalSettings } from '../../types/index.js';

const router = Router();

/**
 * Valid CLI types for the reviewer configuration
 */
const VALID_CLI_TYPES: CliType[] = ['codex', 'claude'];

/**
 * Type guard to check if a value is a valid CliType
 */
function isValidCliType(value: unknown): value is CliType {
  return typeof value === 'string' && VALID_CLI_TYPES.includes(value as CliType);
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
 * Updates global settings with reviewer configuration
 *
 * Request body: { reviewer: { cli: 'codex' | 'claude' } }
 * Response: { success: true, settings: { reviewer: { cli: '...' } } }
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

    // Validate reviewer property exists
    if (!body.reviewer || typeof body.reviewer !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body',
        details: 'Missing required field: reviewer',
      });
    }

    // Validate cli value
    const { cli } = body.reviewer;
    if (!isValidCliType(cli)) {
      return res.status(400).json({
        error: 'Invalid CLI value',
        details: `cli must be one of: ${VALID_CLI_TYPES.join(', ')}`,
      });
    }

    // Build and save settings
    const settings: GlobalSettings = {
      reviewer: {
        cli,
      },
    };

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

export default router;
