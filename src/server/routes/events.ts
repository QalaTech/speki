import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import type { Request, Response } from 'express';
import type { RalphStatus, DecomposeState } from '../../types/index.js';
import { subscribeRalph, subscribeDecompose, subscribeTasks, subscribePeerFeedback, subscribeProjects, publishTasks, publishPeerFeedback, publishProjects, subscribeSpecReview } from '../sse.js';
import { Registry } from '../../core/registry.js';

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

// SSE: Tasks (PRD) events
router.get('/tasks', projectContext(true), async (req: Request, res: Response) => {
  subscribeTasks(req.projectPath!, res);
  try {
    const prd = await req.project!.loadPRD();
    if (prd) publishTasks(req.projectPath!, 'tasks/snapshot', prd);
  } catch {}
});

// SSE: Peer feedback events
router.get('/peer-feedback', projectContext(true), async (req: Request, res: Response) => {
  subscribePeerFeedback(req.projectPath!, res);
  try {
    const pf = await req.project!.loadPeerFeedback();
    publishPeerFeedback(req.projectPath!, 'peer-feedback/snapshot', pf);
  } catch {}
});

// SSE: Projects registry (global)
router.get('/projects', async (_req: Request, res: Response) => {
  subscribeProjects(res);
  try {
    const projects = await Registry.list();
    publishProjects('projects/snapshot', projects);
  } catch {}
});

// SSE: Spec review events
router.get('/spec-review', projectContext(true), async (req: Request, res: Response) => {
  subscribeSpecReview(req.projectPath!, res);
});

export default router;
