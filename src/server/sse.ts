import type { Response } from 'express';
import type { RalphSseEvent, DecomposeSseEvent } from '../types/index.js';

type ProjectKey = string;

interface Subscriber {
  res: Response;
  heartbeat: NodeJS.Timeout;
}

const ralphSubs = new Map<ProjectKey, Set<Subscriber>>();
const decomposeSubs = new Map<ProjectKey, Set<Subscriber>>();
const ralphIds = new Map<ProjectKey, number>();
const decomposeIds = new Map<ProjectKey, number>();

function getSet(map: Map<ProjectKey, Set<Subscriber>>, key: ProjectKey): Set<Subscriber> {
  let set = map.get(key);
  if (!set) {
    set = new Set<Subscriber>();
    map.set(key, set);
  }
  return set;
}

function writeSse<T extends string, D>(res: Response, id: number, evt: { event: T; projectPath: string; data: D; timestamp: string }) {
  res.write(`id: ${id}\n`);
  res.write(`event: ${evt.event}\n`);
  res.write(`data: ${JSON.stringify(evt)}\n\n`);
}

function addSubscriber(map: Map<ProjectKey, Set<Subscriber>>, projectPath: string, res: Response, onClose?: () => void) {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Immediately flush headers and send a comment to establish stream
  res.write(': connected\n\n');

  const subs = getSet(map, projectPath);
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 30000);
  const subscriber: Subscriber = { res, heartbeat };
  subs.add(subscriber);

  res.on('close', () => {
    clearInterval(heartbeat);
    subs.delete(subscriber);
    onClose?.();
  });
}

export function subscribeRalph(projectPath: string, res: Response): void {
  addSubscriber(ralphSubs, projectPath, res);
  // Send an initial connected event
  publishRalph(projectPath, 'ralph/connected', { message: 'connected' });
}

export function subscribeDecompose(projectPath: string, res: Response): void {
  addSubscriber(decomposeSubs, projectPath, res);
  publishDecompose(projectPath, 'decompose/connected', { message: 'connected' });
}

function publish<T extends string, D>(
  map: Map<ProjectKey, Set<Subscriber>>,
  idMap: Map<ProjectKey, number>,
  projectPath: string,
  event: T,
  data: D
) {
  const subs = map.get(projectPath);
  if (!subs || subs.size === 0) return;
  const nextId = (idMap.get(projectPath) ?? 0) + 1;
  idMap.set(projectPath, nextId);
  const envelope = { event, projectPath, data, timestamp: new Date().toISOString() } as const;
  for (const sub of subs) {
    try {
      writeSse(sub.res, nextId, envelope);
    } catch {
      // ignore broken pipe; cleanup will happen on 'close'
    }
  }
}

export function publishRalph<K extends RalphSseEvent['event']>(projectPath: string, event: K, data: Extract<RalphSseEvent, { event: K }>['data']): void {
  publish(ralphSubs, ralphIds, projectPath, event, data);
}

export function publishDecompose<K extends DecomposeSseEvent['event']>(projectPath: string, event: K, data: Extract<DecomposeSseEvent, { event: K }>['data']): void {
  publish(decomposeSubs, decomposeIds, projectPath, event, data);
}
