/**
 * Spec Routes
 *
 * API endpoints for accessing spec-partitioned state.
 * All routes require project context via ?project= query param.
 */

import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import {
  extractSpecId,
  findSpecFiles,
  listSpecs,
  readSpecMetadata,
  loadPRDForSpec,
  detectSpecType,
} from '../../core/spec-review/spec-metadata.js';
import { relative } from 'path';
import type { SpecType } from '../../types/index.js';

const router = Router();

// Apply project context middleware to all routes
router.use(projectContext(true));

/**
 * GET /api/specs
 * Returns list of all specs discovered from filesystem with their metadata.
 * Specs without metadata are returned with status 'draft'.
 * Includes type detection from frontmatter or filename.
 */
router.get('/', async function (req, res) {
  try {
    const projectPath = req.projectPath!;

    // Discover spec files from filesystem
    const specFiles = await findSpecFiles(projectPath);

    const specs = await Promise.all(
      specFiles.map(async function (specPath) {
        const specId = extractSpecId(specPath);
        const metadata = await readSpecMetadata(projectPath, specId);
        const relativePath = relative(projectPath, specPath);

        // Detect type from metadata, frontmatter, or filename
        let specType: SpecType = metadata?.type ?? 'prd';
        let parent: string | undefined = metadata?.parent;

        if (!metadata?.type) {
          const detected = await detectSpecType(specPath);
          specType = detected.type;
          parent = detected.parent;
        }

        return {
          specId,
          specPath: relativePath,
          status: metadata?.status ?? 'draft',
          type: specType,
          parent: parent ?? null,
          created: metadata?.created ?? null,
          lastModified: metadata?.lastModified ?? null,
        };
      })
    );

    res.json({ specs });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to list specs', details });
  }
});

/**
 * GET /api/specs/:specId/tasks
 * Returns tasks (PRD data) for a specific spec
 */
router.get('/:specId/tasks', async function (req, res) {
  try {
    const projectPath = req.projectPath!;
    const { specId } = req.params;

    const metadata = await readSpecMetadata(projectPath, specId);
    if (!metadata) {
      return res.status(404).json({ error: 'Spec not found', specId });
    }

    const prd = await loadPRDForSpec(projectPath, specId);
    res.json({
      specId,
      tasks: prd?.userStories || [],
      projectName: prd?.projectName || null,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to load tasks for spec', details });
  }
});

/**
 * GET /api/specs/:specId/status
 * Returns metadata and status for a specific spec
 */
router.get('/:specId/status', async function (req, res) {
  try {
    const projectPath = req.projectPath!;
    const { specId } = req.params;

    const metadata = await readSpecMetadata(projectPath, specId);
    if (!metadata) {
      return res.status(404).json({ error: 'Spec not found', specId });
    }

    res.json({ specId, ...metadata });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to load spec status', details });
  }
});

export default router;
