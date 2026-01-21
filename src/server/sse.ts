import type { Response } from 'express';
import type { RalphSseEvent, DecomposeSseEvent, TasksSseEvent, PeerFeedbackSseEvent, ProjectsSseEvent, SpecReviewSseEvent, UnifiedSseEvent, PRDData, PeerFeedback } from '../types/index.js';
import type { ProjectEntry } from '../types/index.js';
import { startFileWatcher, stopFileWatcher } from './file-watcher.js';

type ProjectKey = string;

interface Subscriber {
  res: Response;
  heartbeat: NodeJS.Timeout;
}

const ralphSubs = new Map<ProjectKey, Set<Subscriber>>();
const decomposeSubs = new Map<ProjectKey, Set<Subscriber>>();
const ralphIds = new Map<ProjectKey, number>();
const decomposeIds = new Map<ProjectKey, number>();
const tasksSubs = new Map<ProjectKey, Set<Subscriber>>();
const tasksIds = new Map<ProjectKey, number>();
const peerSubs = new Map<ProjectKey, Set<Subscriber>>();
const peerIds = new Map<ProjectKey, number>();
const projectsSubs = new Map<ProjectKey, Set<Subscriber>>();
let projectsId = 0;
const specReviewSubs = new Map<ProjectKey, Set<Subscriber>>();
const specReviewIds = new Map<ProjectKey, number>();

// Unified subscription map (all per-project events)
const unifiedSubs = new Map<ProjectKey, Set<Subscriber>>();
const unifiedIds = new Map<ProjectKey, number>();

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

function handleReconnect(idMap: Map<ProjectKey, number>, projectPath: string, lastEventId?: string): boolean {
  const currentId = idMap.get(projectPath) ?? 0;
  const requestedId = lastEventId ? parseInt(lastEventId, 10) : 0;

  // Client is behind - they missed events
  if (!isNaN(requestedId) && requestedId < currentId) {
    return true; // Caller should send snapshot
  }

  return false; // Client is up to date
}

function addSubscriber(map: Map<ProjectKey, Set<Subscriber>>, projectPath: string, res: Response, lastEventId?: string, onClose?: () => void) {
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

export function subscribeRalph(projectPath: string, res: Response, lastEventId?: string): void {
  addSubscriber(ralphSubs, projectPath, res, lastEventId);
  // Send an initial connected event
  publishRalph(projectPath, 'ralph/connected', { message: 'connected' });
}

export function subscribeDecompose(projectPath: string, res: Response, lastEventId?: string): void {
  addSubscriber(decomposeSubs, projectPath, res, lastEventId);
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
  // Also publish to unified stream (direct call for type safety)
  publish(unifiedSubs, unifiedIds, projectPath, event, data);
}

export function publishDecompose<K extends DecomposeSseEvent['event']>(projectPath: string, event: K, data: Extract<DecomposeSseEvent, { event: K }>['data']): void {
  publish(decomposeSubs, decomposeIds, projectPath, event, data);
  // Also publish to unified stream (direct call for type safety)
  publish(unifiedSubs, unifiedIds, projectPath, event, data);
}

// Tasks (PRD)
export function subscribeTasks(projectPath: string, res: Response, lastEventId?: string): void {
  addSubscriber(tasksSubs, projectPath, res, lastEventId);
}
export function publishTasks<K extends TasksSseEvent['event']>(projectPath: string, event: K, data: Extract<TasksSseEvent, { event: K }>['data']): void {
  publish(tasksSubs, tasksIds, projectPath, event, data);
  // Also publish to unified stream (direct call for type safety)
  publish(unifiedSubs, unifiedIds, projectPath, event, data);
}

// Peer feedback
export function subscribePeerFeedback(projectPath: string, res: Response, lastEventId?: string): void {
  addSubscriber(peerSubs, projectPath, res, lastEventId);
}
export function publishPeerFeedback<K extends PeerFeedbackSseEvent['event']>(projectPath: string, event: K, data: Extract<PeerFeedbackSseEvent, { event: K }>['data']): void {
  publish(peerSubs, peerIds, projectPath, event, data);
  // Also publish to unified stream (direct call for type safety)
  publish(unifiedSubs, unifiedIds, projectPath, event, data);
}

// Projects (global, no projectPath scoping)
export function subscribeProjects(res: Response, lastEventId?: string): void {
  addSubscriber(projectsSubs, '*', res, lastEventId);
}
export function publishProjects<K extends ProjectsSseEvent['event']>(event: K, data: Extract<ProjectsSseEvent, { event: K }>['data']): void {
  const subs = projectsSubs.get('*');
  if (!subs || subs.size === 0) return;
  projectsId += 1;
  const envelope = { event, projectPath: '*', data, timestamp: new Date().toISOString() } as const;
  for (const sub of subs) {
    try {
      writeSse(sub.res, projectsId, envelope);
    } catch {}
  }
}

// Spec Review
export function subscribeSpecReview(projectPath: string, res: Response, lastEventId?: string): void {
  // Start file watcher for this project (idempotent - won't duplicate if already watching)
  startFileWatcher(projectPath);

  addSubscriber(specReviewSubs, projectPath, res, lastEventId, () => {
    // On close, check if there are no more subscribers for this project
    const subs = specReviewSubs.get(projectPath);
    if (!subs || subs.size === 0) {
      stopFileWatcher(projectPath);
    }
  });
  publishSpecReview(projectPath, 'spec-review/connected', { message: 'connected' });
}
export function publishSpecReview<K extends SpecReviewSseEvent['event']>(projectPath: string, event: K, data: Extract<SpecReviewSseEvent, { event: K }>['data']): void {
  publish(specReviewSubs, specReviewIds, projectPath, event, data);
  // Also publish to unified stream (direct call for type safety)
  publish(unifiedSubs, unifiedIds, projectPath, event, data);
}

// Unified (all per-project events multiplexed)
export function subscribeUnified(projectPath: string, res: Response, lastEventId?: string): void {
  // Start file watcher for this project (idempotent - won't duplicate if already watching)
  startFileWatcher(projectPath);

  addSubscriber(unifiedSubs, projectPath, res, lastEventId, () => {
    // On close, check if there are no more subscribers for this project
    const subs = unifiedSubs.get(projectPath);
    if (!subs || subs.size === 0) {
      stopFileWatcher(projectPath);
    }
  });
  // Send an initial connected event
  publishUnified(projectPath, 'ralph/connected', { message: 'connected' });
}

export function publishUnified<K extends UnifiedSseEvent['event']>(
  projectPath: string,
  event: K,
  data: Extract<UnifiedSseEvent, { event: K }>['data']
): void {
  publish(unifiedSubs, unifiedIds, projectPath, event, data);
}
