/**
 * Lazy-loads the mermaid library and initializes it once.
 * Mermaid is ~800KB so we code-split it via dynamic import.
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
