import { Router } from 'express';
import { projectContext } from '../middleware/project-context.js';
import { subscribeRalph, subscribeDecompose } from '../sse.js';

const router = Router();

// SSE: Ralph loop events
router.get('/ralph', projectContext(true), (req, res) => {
  subscribeRalph(req.projectPath!, res);
});

// SSE: Decompose progress events
router.get('/decompose', projectContext(true), (req, res) => {
  subscribeDecompose(req.projectPath!, res);
});

export default router;

