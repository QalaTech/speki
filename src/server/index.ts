/**
 * Qala Multi-Project Dashboard Server
 *
 * Express server that provides API endpoints for managing multiple
 * projects from a central dashboard.
 */

import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';
import ralphRouter from './routes/ralph.js';
import decomposeRouter from './routes/decompose.js';
import settingsRouter from './routes/settings.js';
import specReviewRouter from './routes/spec-review.js';
import sessionsRouter from './routes/sessions.js';
import specsRouter from './routes/specs.js';
import queueRouter from './routes/queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServerOptions {
  port?: number;
  host?: string;
}

export async function createServer(options: ServerOptions = {}) {
  const { port = 3000, host = 'localhost' } = options;

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use(function (req, res, next) {
    const start = Date.now();
    res.on('finish', function () {
      const duration = Date.now() - start;
      const project = req.query.project || req.headers['x-project-path'] || '-';
      console.log(`${req.method} ${req.path} [${project}] ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // API Routes
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/ralph', ralphRouter);
  app.use('/api/decompose', decomposeRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/spec-review', specReviewRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/specs', specsRouter);
  app.use('/api/queue', queueRouter);

  // Health check
  app.get('/api/health', function (_req, res) {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // Serve static files for dashboard UI
  // Try to find the web build directory (Vite outputs to 'dist')
  const possibleWebPaths = [
    join(__dirname, '..', '..', '..', 'web', 'dist'),     // from dist/src/server
    join(__dirname, '..', '..', 'web', 'dist'),          // from src/server (dev)
    join(__dirname, '..', '..', '..', '..', 'web', 'dist'), // monorepo structure
  ];

  let webBuildPath: string | null = null;
  for (const p of possibleWebPaths) {
    try {
      await fs.access(p);
      webBuildPath = p;
      break;
    } catch {
      // Try next path
    }
  }

  if (webBuildPath) {
    app.use(express.static(webBuildPath));

    // SPA fallback - serve index.html for non-API routes
    app.get('*', function (req, res, next) {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(join(webBuildPath!, 'index.html'));
    });
  } else {
    // No web build found, provide a simple status page
    app.get('/', function (_req, res) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Qala Dashboard</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
            .status { color: #0a0; }
          </style>
        </head>
        <body>
          <h1>Qala Dashboard Server</h1>
          <p class="status">Server is running on port ${port}</p>
          <h2>API Endpoints</h2>
          <ul>
            <li><code>GET /api/projects</code> - List all registered projects</li>
            <li><code>GET /api/tasks?project=PATH</code> - Get tasks for a project</li>
            <li><code>GET /api/ralph/status?project=PATH</code> - Get Ralph status</li>
            <li><code>POST /api/ralph/start?project=PATH</code> - Start Ralph</li>
            <li><code>POST /api/ralph/stop?project=PATH</code> - Stop Ralph</li>
            <li><code>GET /api/decompose/state?project=PATH</code> - Get decompose state</li>
            <li><code>POST /api/decompose/start?project=PATH</code> - Start decomposition</li>
          </ul>
          <h2>Web Dashboard</h2>
          <p>Web dashboard build not found. Run <code>cd web && npm run build</code> to build the dashboard UI.</p>
        </body>
        </html>
      `);
    });
  }

  // Error handler
  app.use(function (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  });

  return { app, port, host };
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const { app, port, host } = await createServer(options);

  return new Promise(function (resolve) {
    app.listen(port, function () {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                 Qala Dashboard Server                       ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://${host}:${port}                    ║
║                                                            ║
║  API Endpoints:                                            ║
║    GET  /api/projects         - List all projects          ║
║    GET  /api/tasks            - Get project tasks          ║
║    GET  /api/ralph/status     - Get Ralph status           ║
║    POST /api/ralph/start      - Start Ralph                ║
║    POST /api/ralph/stop       - Stop Ralph                 ║
║                                                            ║
║  Press Ctrl+C to stop                                      ║
╚════════════════════════════════════════════════════════════╝
`);
      resolve();
    });
  });
}
