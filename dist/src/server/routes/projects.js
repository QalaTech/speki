/**
 * Project Routes
 *
 * API endpoints for managing projects in the central registry.
 */
import { Router } from 'express';
import { Registry } from '../../core/registry.js';
import { Project } from '../../core/project.js';
const router = Router();
/**
 * GET /api/projects
 * List all registered projects with their current status
 */
router.get('/', async (req, res) => {
    try {
        const projects = await Registry.list();
        // Enrich with current status from each project
        const enriched = await Promise.all(projects.map(async (entry) => {
            try {
                const project = new Project(entry.path);
                if (await project.exists()) {
                    const status = await project.loadStatus();
                    const config = await project.loadConfig();
                    const decomposeState = await project.loadDecomposeState();
                    return {
                        ...entry,
                        ralphStatus: status,
                        config,
                        decomposeState: {
                            status: decomposeState.status,
                            message: decomposeState.message,
                        },
                    };
                }
            }
            catch {
                // Project folder may not exist
            }
            return entry;
        }));
        res.json(enriched);
    }
    catch (error) {
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
            return res.status(404).json({ error: 'Project .ralph folder not found' });
        }
        const [status, config, decomposeState, prd] = await Promise.all([
            project.loadStatus(),
            project.loadConfig(),
            project.loadDecomposeState(),
            project.loadPRD(),
        ]);
        res.json({
            ...entry,
            ralphStatus: status,
            config,
            decomposeState,
            prd,
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to get project',
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
                error: 'Project .ralph folder not found. Run qala init first.',
            });
        }
        const projectName = name || (await project.loadConfig()).name;
        await Registry.register(projectPath, projectName);
        res.json({ success: true, path: projectPath, name: projectName });
    }
    catch (error) {
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
        res.json({ success: true, path: projectPath });
    }
    catch (error) {
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
        res.json({ success: true, path: projectPath, status });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to update status',
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
export default router;
//# sourceMappingURL=projects.js.map