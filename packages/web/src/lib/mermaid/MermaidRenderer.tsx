/**
 * Shared Mermaid rendering component.
 * Used by both MDXEditor (MermaidCodeBlockEditor) and chat (CodeBlock).
 *
 * Uses mermaid.run() which renders in-place with correct DOM measurement,
 * avoiding the foreignObject clipping bugs (mermaid#790).
 * Includes debounce (300ms) to avoid re-rendering on every keystroke.
 */
import { useEffect, useRef, useState } from 'react';
import { getMermaid } from './mermaid-lazy';

interface MermaidRendererProps {
  code: string;
  className?: string;
}

export function MermaidRenderer({ code, className }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const trimmed = code.trim();
    if (!trimmed) {
      if (containerRef.current) containerRef.current.innerHTML = '';
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid();
        if (cancelled) return;

        const el = containerRef.current;
        if (!el) return;

        el.textContent = trimmed;
        el.removeAttribute('data-processed');
        await mermaid.run({ nodes: [el] });

        if (!cancelled) {
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (containerRef.current) containerRef.current.innerHTML = '';
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  return (
    <div className={`mermaid-renderer ${error ? 'mermaid-error' : loading ? 'mermaid-loading' : 'mermaid-success'} ${className ?? ''}`}>
      {loading && !error && <span className="mermaid-loading-text">Rendering diagram…</span>}
      {error && (
        <>
          <span className="mermaid-error-label">Diagram error</span>
          <pre className="mermaid-error-message">{error}</pre>
        </>
      )}
      <div ref={containerRef} className="mermaid" style={{ display: error ? 'none' : undefined }} />
    </div>
  );
}
