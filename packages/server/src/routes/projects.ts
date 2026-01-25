/**
 * Project Routes
 *
 * API endpoints for managing projects in the central registry.
 */

import { Router } from 'express';
import { Registry, Project, listSpecs, readSpecMetadata, loadPRDForSpec } from '@speki/core';
import { publishProjects } from '../sse.js';
import { homedir } from 'os';
import { resolve, join } from 'path';
import { readdir, stat } from 'fs/promises';

const router = Router();

/**
 * Expand path with ~ support
 */
function expandPath(inputPath: string): string {
  if (inputPath.startsWith('~/')) {
    return join(homedir(), inputPath.slice(2));
  }
  if (inputPath.startsWith('~')) {
    return homedir();
  }
  return resolve(inputPath);
}

/**
 * GET /api/projects/browse
 * Browse directories for folder selection
 */
router.get('/browse', async (req, res) => {
  try {
    const rawPath = (req.query.path as string) || '~';
    const dirPath = expandPath(rawPath);

    const entries = await readdir(dirPath, { withFileTypes: true });
    const directories = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const fullPath = join(dirPath, entry.name);
        let hasSubdirs = false;
        let isSpekiProject = false;

        try {
          const subEntries = await readdir(fullPath, { withFileTypes: true });
          hasSubdirs = subEntries.some(e => e.isDirectory() && !e.name.startsWith('.'));
          isSpekiProject = subEntries.some(e => e.isDirectory() && e.name === '.speki');
        } catch {
          // Can't read subdirectory, that's fine
        }

        directories.push({
          name: entry.name,
          path: fullPath,
          hasSubdirs,
          isSpekiProject,
        });
      }
    }

    // Sort alphabetically
    directories.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      currentPath: dirPath,
      parentPath: dirPath !== '/' ? resolve(dirPath, '..') : null,
      directories,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to browse directory',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/projects/expand-path
 * Expand a path (resolve ~ and relative paths)
 */
router.get('/expand-path', async (req, res) => {
  try {
    const rawPath = req.query.path as string;
    if (!rawPath) {
      return res.status(400).json({ error: 'Path required' });
    }

    const expandedPath = expandPath(rawPath);

    // Check if path exists and is a directory
    let exists = false;
    let isDirectory = false;
    let isSpekiProject = false;

    try {
      const stats = await stat(expandedPath);
      exists = true;
      isDirectory = stats.isDirectory();

      if (isDirectory) {
        const entries = await readdir(expandedPath, { withFileTypes: true });
        isSpekiProject = entries.some(e => e.isDirectory() && e.name === '.speki');
      }
    } catch {
      // Path doesn't exist
    }

    res.json({
      originalPath: rawPath,
      expandedPath,
      exists,
      isDirectory,
      isSpekiProject,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to expand path',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/projects
 * List all registered projects with their current status
 */
router.get('/', async (req, res) => {
  try {
    const projects = await Registry.list();

    // Enrich with current status from each project
    const enriched = await Promise.all(
      projects.map(async (entry) => {
        try {
          const project = new Project(entry.path);
          if (await project.exists()) {
            const status = await project.loadStatus();
            const config = await project.loadConfig();
            const specs = await listSpecs(entry.path);

            // Get active spec info if any (parallel reads)
            let activeSpec = null;
            const metadataResults = await Promise.all(
              specs.map(async (specId) => {
                const metadata = await readSpecMetadata(entry.path, specId);
                return { specId, metadata };
              })
            );
            for (const { specId, metadata } of metadataResults) {
              if (metadata?.status === 'active') {
                activeSpec = { id: specId, ...metadata };
                break;
              }
            }

            return {
              ...entry,
              ralphStatus: status,
              config,
              specCount: specs.length,
              activeSpec,
            };
          }
        } catch {
          // Project folder may not exist
        }
        return entry;
      })
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list projects',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/projects/:path
 * Get detailed info for a specific project
 * :path is base64 encoded project path
 */
router.get('/:encodedPath', async (req, res) => {
  try {
    const projectPath = Buffer.from(req.params.encodedPath, 'base64').toString('utf-8');
    const entry = await Registry.get(projectPath);

    if (!entry) {
      return res.status(404).json({ error: 'Project not found in registry' });
    }

    const project = new Project(projectPath);
    if (!(await project.exists())) {
      return res.status(404).json({ error: 'Project .speki folder not found' });
    }

    const [status, config] = await Promise.all([
      project.loadStatus(),
      project.loadConfig(),
    ]);

    // Get all specs with their metadata and task counts
    const specIds = await listSpecs(projectPath);
    const specs = await Promise.all(
      specIds.map(async (specId) => {
        const metadata = await readSpecMetadata(projectPath, specId);
        const prd = await loadPRDForSpec(projectPath, specId);
        return {
          id: specId,
          metadata,
          taskCount: prd?.userStories?.length || 0,
          completedCount: prd?.userStories?.filter(s => s.passes).length || 0,
        };
      })
    );

    res.json({
      ...entry,
      ralphStatus: status,
      config,
      specs,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get project',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/projects/init
 * Initialize a new project at the specified path
 */
router.post('/init', async (req, res) => {
  try {
    const { path: rawPath, name, branch = 'main', language = 'nodejs' } = req.body;

    if (!rawPath) {
      return res.status(400).json({ error: 'Project path required' });
    }

    // Expand ~ and resolve relative paths
    const projectPath = expandPath(rawPath);
    const project = new Project(projectPath);

    // Check if already initialized
    if (await project.exists()) {
      return res.status(409).json({
        error: 'Project already initialized',
        details: '.speki directory already exists at this path'
      });
    }

    // Determine project name from path if not provided
    const projectName = name || projectPath.split('/').pop() || 'unnamed';

    // Initialize .speki directory
    await project.initialize({
      name: projectName,
      branchName: branch,
      language,
    });

    // Register in central registry
    await Registry.register(projectPath, projectName);

    // Notify clients
    const projects = await Registry.list();
    publishProjects('projects/updated', projects);

    res.json({
      success: true,
      path: projectPath,
      name: projectName,
      branch,
      language
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to initialize project',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/projects/register
 * Register a new project (usually done via CLI, but available via API)
 */
router.post('/register', async (req, res) => {
  try {
    const { path: projectPath, name } = req.body;

    if (!projectPath) {
      return res.status(400).json({ error: 'Project path required' });
    }

    const project = new Project(projectPath);
    if (!(await project.exists())) {
      return res.status(404).json({
        error: 'Project .speki folder not found. Run qala init first.',
      });
    }

    const projectName = name || (await project.loadConfig()).name;
    await Registry.register(projectPath, projectName);
    const projects = await Registry.list();
    publishProjects('projects/updated', projects);
    res.json({ success: true, path: projectPath, name: projectName });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to register project',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/projects/:encodedPath
 * Unregister a project from the registry
 */
router.delete('/:encodedPath', async (req, res) => {
  try {
    const projectPath = Buffer.from(req.params.encodedPath, 'base64').toString('utf-8');

    const entry = await Registry.get(projectPath);
    if (!entry) {
      return res.status(404).json({ error: 'Project not found in registry' });
    }

    await Registry.unregister(projectPath);
    const projects = await Registry.list();
    publishProjects('projects/updated', projects);
    res.json({ success: true, path: projectPath });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to unregister project',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/projects/:encodedPath/status
 * Update project status in registry
 */
router.put('/:encodedPath/status', async (req, res) => {
  try {
    const projectPath = Buffer.from(req.params.encodedPath, 'base64').toString('utf-8');
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status required' });
    }

    await Registry.updateStatus(projectPath, status);
    const projects = await Registry.list();
    publishProjects('projects/updated', projects);
    res.json({ success: true, path: projectPath, status });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/project/config
 * Get project configuration (including LLM overrides)
 */
router.get('/config', async (req, res) => {
  try {
    const projectPath = req.query.project as string;
    if (!projectPath) {
      return res.status(400).json({ error: 'Project path is required' });
    }

    const project = new Project(projectPath);
    if (!(await project.exists())) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const config = await project.loadConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load project config',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/project/config
 * Update project configuration (including LLM overrides)
 */
router.put('/config', async (req, res) => {
  try {
    const projectPath = req.query.project as string;
    if (!projectPath) {
      return res.status(400).json({ error: 'Project path is required' });
    }

    const project = new Project(projectPath);
    if (!(await project.exists())) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updatedConfig = req.body;
    await project.saveConfig(updatedConfig);

    res.json(updatedConfig);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save project config',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
