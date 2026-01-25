import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import type { Request, Response } from 'express';
import type { RalphStatus, DecomposeState } from '@speki/core';
import { subscribeRalph, subscribeDecompose, subscribeTasks, subscribePeerFeedback, subscribeProjects, publishTasks, publishPeerFeedback, publishProjects, subscribeSpecReview, subscribeUnified, publishUnified } from '../sse.js';
import { loadQueueAsPRDData } from '@speki/core';
import { Registry } from '@speki/core';

const router = Router();

// SSE: Ralph loop events
router.get('/ralph', projectContext(true), async (req: Request, res: Response) => {
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  subscribeRalph(req.projectPath!, res, lastEventId);
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
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  subscribeDecompose(req.projectPath!, res, lastEventId);
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
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  subscribeTasks(req.projectPath!, res, lastEventId);
  try {
    const prd = await req.project!.loadPRD();
    if (prd) publishTasks(req.projectPath!, 'tasks/snapshot', prd);
  } catch {}
});

// SSE: Peer feedback events
router.get('/peer-feedback', projectContext(true), async (req: Request, res: Response) => {
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  subscribePeerFeedback(req.projectPath!, res, lastEventId);
  try {
    const pf = await req.project!.loadPeerFeedback();
    publishPeerFeedback(req.projectPath!, 'peer-feedback/snapshot', pf);
  } catch {}
});

// SSE: Projects registry (global)
router.get('/projects', async (req: Request, res: Response) => {
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  subscribeProjects(res, lastEventId);
  try {
    const projects = await Registry.list();
    publishProjects('projects/snapshot', projects);
  } catch {}
});

// SSE: Spec review events
router.get('/spec-review', projectContext(true), async (req: Request, res: Response) => {
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  subscribeSpecReview(req.projectPath!, res, lastEventId);
});

// SSE: Unified events (all per-project event types multiplexed)
router.get('/all', projectContext(true), async (req: Request, res: Response) => {
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  subscribeUnified(req.projectPath!, res, lastEventId);

  try {
    // Send initial snapshots for all channels
    const [ralphStatus, decomposeState, prdData, peerFeedback] = await Promise.all([
      req.project!.loadStatus().catch(() => null),
      req.project!.loadDecomposeState().catch(() => null),
      // Load from task queue instead of legacy prd.json
      loadQueueAsPRDData(req.projectPath!).catch(() => null),
      req.project!.loadPeerFeedback().catch(() => null),
    ]);

    if (ralphStatus) publishUnified(req.projectPath!, 'ralph/status', { status: ralphStatus });
    if (decomposeState) publishUnified(req.projectPath!, 'decompose/state', decomposeState);
    if (prdData) publishUnified(req.projectPath!, 'tasks/snapshot', prdData);
    if (peerFeedback) publishUnified(req.projectPath!, 'peer-feedback/snapshot', peerFeedback);
  } catch {
    // Ignore snapshot errors - subscribers will get updates as they occur
  }
});

export default router;
