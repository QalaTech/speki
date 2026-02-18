/**
 * Shared Mermaid rendering component.
 * Used by both MDXEditor (MermaidCodeBlockEditor) and chat (CodeBlock).
 *
 * Uses mermaid.run() which renders in-place with correct DOM measurement,
 * avoiding the foreignObject clipping bugs (mermaid#790).
 * Includes debounce (300ms) to avoid re-rendering on every keystroke.
 *
 * Text contrast on custom-styled nodes is handled primarily by CSS :has()
 * rules in dark-theme.css. A JS fallback runs post-render for robustness.
 */
import { useEffect, useRef, useState } from 'react';
import { queueMermaidRun } from './mermaid-lazy';

interface MermaidRendererProps {
  code: string;
  className?: string;
}

type RGB = [number, number, number];

function parseColor(color: string): RGB | null {
  const trimmed = color.trim();
  const hex = trimmed.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const rgbMatch = trimmed.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }
  return null;
}

function relativeLuminance([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * JS fallback for text contrast. Walks every element with an inline fill,
 * checks luminance, and forces dark text on light backgrounds.
 * This supplements the CSS :has() rules in dark-theme.css.
 */
function fixNodeTextContrast(container: HTMLElement): void {
  const DARK_TEXT = '#1e293b';
  const LUMINANCE_THRESHOLD = 0.4;

  const svg = container.querySelector('svg');
  if (!svg) return;

  const processed = new WeakSet<Element>();

  // Find shapes (rect, polygon, circle, etc.) with inline fill styles
  // from mermaid `style` directives, e.g. `style X fill:#cfc`
  svg.querySelectorAll('rect, polygon, circle, ellipse, path').forEach((shape) => {
    // Check inline style first, then fill attribute
    const styleAttr = shape.getAttribute('style') ?? '';
    const fillMatch = styleAttr.match(/fill:\s*([^;]+)/);
    const fillValue = fillMatch ? fillMatch[1].trim() : shape.getAttribute('fill');
    if (!fillValue) return;

    const rgb = parseColor(fillValue);
    if (!rgb) return;
    if (relativeLuminance(rgb) <= LUMINANCE_THRESHOLD) return;

    // Light fill - walk up to find enclosing group with text
    let group = shape.parentElement;
    while (group && group.tagName !== 'svg') {
      if (
        group.tagName.toLowerCase() === 'g' &&
        (group.querySelector('foreignObject') || group.querySelector('text'))
      ) {
        break;
      }
      group = group.parentElement;
    }
    if (!group || group.tagName === 'svg' || processed.has(group)) return;
    processed.add(group);

    // Force dark text on all text descendants
    group.querySelectorAll('foreignObject *').forEach((el) => {
      if ((el as HTMLElement).style) {
        (el as HTMLElement).style.setProperty('color', DARK_TEXT, 'important');
      }
    });
    group.querySelectorAll('text, tspan').forEach((el) => {
      (el as SVGElement).setAttribute('fill', DARK_TEXT);
      if ((el as SVGElement).style) {
        (el as SVGElement).style.setProperty('fill', DARK_TEXT, 'important');
      }
    });
  });
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
        if (cancelled) return;

        const el = containerRef.current;
        if (!el) return;

        el.textContent = trimmed;
        el.removeAttribute('data-processed');
        await queueMermaidRun(el);
        fixNodeTextContrast(el);

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
