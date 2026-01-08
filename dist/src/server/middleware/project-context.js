/**
 * Project Context Middleware
 *
 * Resolves the project from request parameters and attaches it to the request.
 */
import { Project } from '../../core/project.js';
import { Registry } from '../../core/registry.js';
/**
 * Middleware that resolves project from query param or header
 * Usage: GET /api/tasks?project=/path/to/project
 *    or: GET /api/tasks with X-Project-Path header
 */
export function projectContext(required = true) {
    return async (req, res, next) => {
        // Get project path from query param, header, or body
        const projectPath = req.query.project ||
            req.headers['x-project-path'] ||
            req.body?.projectPath;
        if (!projectPath) {
            if (required) {
                return res.status(400).json({
                    error: 'Project path required. Use ?project= query param or X-Project-Path header'
                });
            }
            return next();
        }
        // Create project instance
        const project = new Project(projectPath);
        // Verify project exists
        if (!(await project.exists())) {
            return res.status(404).json({
                error: `Project not found: ${projectPath}. Run 'qala init' first.`
            });
        }
        // Attach to request
        req.project = project;
        req.projectPath = projectPath;
        next();
    };
}
/**
 * Middleware that validates project exists in registry
 */
export function registeredProject() {
    return async (req, res, next) => {
        const projectPath = req.query.project ||
            req.headers['x-project-path'] ||
            req.body?.projectPath;
        if (!projectPath) {
            return res.status(400).json({
                error: 'Project path required'
            });
        }
        const entry = await Registry.get(projectPath);
        if (!entry) {
            return res.status(404).json({
                error: `Project not registered: ${projectPath}`
            });
        }
        next();
    };
}
//# sourceMappingURL=project-context.js.map