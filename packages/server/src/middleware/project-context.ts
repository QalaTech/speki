/**
 * Project Context Middleware
 *
 * Resolves the project from request parameters and attaches it to the request.
 */

import type { Request, Response, NextFunction } from 'express';
import { Project } from '@speki/core';
import { Registry } from '@speki/core';

// Extend Express Request type
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
export function projectContext(required = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Get project path from query param, header, or body
    const projectPath =
      (req.query.project as string) ||
      req.headers['x-project-path'] as string ||
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
  return async (req: Request, res: Response, next: NextFunction) => {
    const projectPath =
      (req.query.project as string) ||
      req.headers['x-project-path'] as string ||
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
