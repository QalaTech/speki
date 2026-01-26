/**
 * Lazy-loads the mermaid library and initializes it once.
 * Mermaid is ~800KB so we code-split it via dynamic import.
 *
 * Also provides a serialized render queue because mermaid.run() uses
 * global state and produces garbled output when called concurrently
 * (e.g. 3 diagrams in a single chat message all mount at once).
 */
import type mermaidAPI from 'mermaid';
import { mermaidThemeVariables } from './mermaid-theme';

let mermaidInstance: typeof mermaidAPI | null = null;
let initPromise: Promise<typeof mermaidAPI> | null = null;

/**
 * Returns the initialized mermaid instance, loading it on first call.
 * Subsequent calls return the cached instance.
 */
export function getMermaid(): Promise<typeof mermaidAPI> {
  if (mermaidInstance) return Promise.resolve(mermaidInstance);
  if (initPromise) return initPromise;

  initPromise = import('mermaid').then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: mermaidThemeVariables,
      securityLevel: 'strict',
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
      },
    });
    mermaidInstance = mermaid;
    return mermaid;
  });

  return initPromise;
}

/** Serializes mermaid.run() calls to prevent concurrent rendering conflicts. */
let renderQueue: Promise<void> = Promise.resolve();

export function queueMermaidRun(node: HTMLElement): Promise<void> {
  const job = renderQueue.then(async () => {
    const mermaid = await getMermaid();
    await mermaid.run({ nodes: [node] });
  });
  // Chain next job regardless of success/failure so the queue doesn't stall
  renderQueue = job.catch(() => {});
  return job;
}
