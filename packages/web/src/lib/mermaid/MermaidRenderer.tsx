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
  const LIGHT_TEXT = '#e2e8f0';
  const DARK_TEXT = '#1e293b';
  const LUMINANCE_THRESHOLD = 0.4;

  const svg = container.querySelector('svg');
  if (!svg) return;

  // 1. Append override rules to mermaid's own <style> tag inside the SVG.
  const svgId = svg.getAttribute('id') ?? '';
  const prefix = svgId ? `#${svgId}` : '';
  const overrideCSS = `
    ${prefix} text, ${prefix} tspan { fill: ${LIGHT_TEXT} !important; }
    ${prefix} .noteText { fill: ${LIGHT_TEXT} !important; }
    ${prefix} .messageText { fill: ${LIGHT_TEXT} !important; }
    ${prefix} .actor { fill: ${LIGHT_TEXT} !important; }
    ${prefix} .labelText { fill: ${LIGHT_TEXT} !important; }
    ${prefix} .loopText { fill: ${LIGHT_TEXT} !important; }
    ${prefix} foreignObject div,
    ${prefix} foreignObject span,
    ${prefix} foreignObject p,
    ${prefix} foreignObject body { color: ${LIGHT_TEXT} !important; }
  `;

  const mermaidStyle = svg.querySelector('style');
  if (mermaidStyle) {
    mermaidStyle.textContent += overrideCSS;
  } else {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = overrideCSS;
    svg.prepend(style);
  }

  // 2. Force white on ALL SVG text elements.
  svg.querySelectorAll('text, tspan').forEach((el) => {
    (el as SVGElement).style.setProperty('fill', LIGHT_TEXT, 'important');
  });

  // 3. Force white on ALL foreignObject content — use setAttribute for
  //    cross-namespace compatibility (SVG foreignObject → HTML content).
  svg.querySelectorAll('foreignObject').forEach((fo) => {
    // Set on the foreignObject itself
    const foStyle = fo.getAttribute('style') || '';
    fo.setAttribute('style', foStyle + `; color: ${LIGHT_TEXT} !important`);
    // Set on every child element
    fo.querySelectorAll('*').forEach((el) => {
      const existingStyle = el.getAttribute('style') || '';
      el.setAttribute('style', existingStyle + `; color: ${LIGHT_TEXT} !important`);
    });
  });

  // 4. For shapes with light fills, override their group's text to dark.
  const processed = new WeakSet<Element>();
  svg.querySelectorAll('rect, polygon, circle, ellipse, path').forEach((shape) => {
    const styleAttr = shape.getAttribute('style') ?? '';
    const fillMatch = styleAttr.match(/fill:\s*([^;]+)/);
    const fillValue = fillMatch ? fillMatch[1].trim() : shape.getAttribute('fill');
    if (!fillValue || fillValue === 'none' || fillValue === 'transparent') return;

    const rgb = parseColor(fillValue);
    if (!rgb) return;
    if (relativeLuminance(rgb) <= LUMINANCE_THRESHOLD) return;

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

    group.querySelectorAll('text, tspan').forEach((el) => {
      (el as SVGElement).style.setProperty('fill', DARK_TEXT, 'important');
    });
    group.querySelectorAll('foreignObject').forEach((fo) => {
      fo.querySelectorAll('*').forEach((el) => {
        el.setAttribute('style', (el.getAttribute('style') || '') + `; color: ${DARK_TEXT} !important`);
      });
    });
  });
}

/**
 * Strips %%{init: ...}%% theme directives from mermaid code so our
 * global dark theme always applies. Preserves non-theme init options.
 */
function stripThemeDirective(code: string): string {
  // Remove %%{init: {...}}%% blocks that set theme, so our dark theme always applies.
  return code.replace(/%%\{init:.*?\}%%\s*/gis, '').trim();
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

    // Strip per-diagram theme/init overrides so our dark theme always applies.
    const sanitized = stripThemeDirective(trimmed);

    setLoading(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        if (cancelled) return;

        const el = containerRef.current;
        if (!el) return;

        el.textContent = sanitized;
        el.removeAttribute('data-processed');
        await queueMermaidRun(el);

        // Wait for the browser to paint the SVG before fixing text colors.
        requestAnimationFrame(() => {
          if (!cancelled) {
            fixNodeTextContrast(el);
            setError(null);
            setLoading(false);
          }
        });
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
