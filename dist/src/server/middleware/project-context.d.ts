/**
 * Project Context Middleware
 *
 * Resolves the project from request parameters and attaches it to the request.
 */
import type { Request, Response, NextFunction } from 'express';
import { Project } from '../../core/project.js';
declare global {
    namespace Express {
        interface Request {
            project?: Project;
            projectPath?: string;
        }
    }
}
/**
 * Middleware that resolves project from query param or header
 * Usage: GET /api/tasks?project=/path/to/project
 *    or: GET /api/tasks with X-Project-Path header
 */
export declare function projectContext(required?: boolean): (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Middleware that validates project exists in registry
 */
export declare function registeredProject(): (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=project-context.d.ts.map