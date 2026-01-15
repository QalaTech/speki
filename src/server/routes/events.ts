import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import type { Request, Response } from 'express';
import type { RalphStatus, DecomposeState } from '../../types/index.js';
import { subscribeRalph, subscribeDecompose } from '../sse.js';

const router = Router();

// SSE: Ralph loop events
router.get('/ralph', projectContext(true), async (req: Request, res: Response) => {
  subscribeRalph(req.projectPath!, res);
  try {
    const status: RalphStatus = await req.project!.loadStatus();
    // initial snapshot
    // publish through SSE publisher so all subscribers get it
    // (safe: may be only this connection at first)
    const { publishRalph } = await import('../sse.js');
    publishRalph(req.projectPath!, 'ralph/status', { status });
  } catch {
    // ignore
  }
});

// SSE: Decompose progress events
router.get('/decompose', projectContext(true), async (req: Request, res: Response) => {
  subscribeDecompose(req.projectPath!, res);
  try {
    const state: DecomposeState = await req.project!.loadDecomposeState();
    const { publishDecompose } = await import('../sse.js');
    publishDecompose(req.projectPath!, 'decompose/state', state);
  } catch {
    // ignore
  }
});

export default router;
