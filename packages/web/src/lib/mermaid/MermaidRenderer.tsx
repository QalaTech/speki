/**
 * Shared Mermaid rendering component.
 * Used by both MDXEditor (MermaidCodeBlockEditor) and chat (CodeBlock).
 *
 * Uses mermaid.run() to render directly into a DOM element (the same approach
 * as the mermaid live editor), which avoids SVG viewBox/foreignObject sizing bugs.
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
    if (!trimmed || !containerRef.current) {
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid();
        if (cancelled || !containerRef.current) return;

        // Set the mermaid source as text content, then let mermaid.run() render it in-place
        const el = containerRef.current;
        el.textContent = trimmed;
        el.removeAttribute('data-processed');

        await mermaid.run({ nodes: [el] });

        if (!cancelled) {
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = '';
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

  if (error) {
    return (
      <div className={`mermaid-renderer mermaid-error ${className ?? ''}`}>
        <span className="mermaid-error-label">Diagram error</span>
        <pre className="mermaid-error-message">{error}</pre>
      </div>
    );
  }

  return (
    <div className={`mermaid-renderer ${loading ? 'mermaid-loading' : 'mermaid-success'} ${className ?? ''}`}>
      {loading && <span className="mermaid-loading-text">Rendering diagram…</span>}
      <div ref={containerRef} className="mermaid" />
    </div>
  );
}
