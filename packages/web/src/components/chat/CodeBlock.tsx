import { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MermaidRenderer } from '../../lib/mermaid/MermaidRenderer';

interface CodeBlockProps {
  language?: string;
  children: string;
  className?: string;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

function MermaidBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);

  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));
  const zoomReset = () => setZoom(1);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        return Math.min(Math.max(z + delta, ZOOM_MIN), ZOOM_MAX);
      });
    }
  }, []);

  return (
    <div className="relative my-2 rounded-md bg-muted" style={{ width: 0, minWidth: '100%' }}>
      <div className="py-1 px-2.5 bg-background/50 border-b border-border flex justify-between items-center">
        <span className="text-[0.7em] text-muted-foreground/50 uppercase tracking-wide">mermaid</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border/20 rounded overflow-hidden">
            <button
              className="bg-muted px-2 py-0.5 text-foreground text-[0.7em] cursor-pointer hover:bg-muted/80"
              onClick={zoomOut}
              title="Zoom out"
            >
              −
            </button>
            <button
              className="bg-muted border-x border-border/20 px-2 py-0.5 text-foreground text-[0.7em] cursor-pointer hover:bg-muted/80 tabular-nums min-w-[40px] text-center"
              onClick={zoomReset}
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="bg-muted px-2 py-0.5 text-foreground text-[0.7em] cursor-pointer hover:bg-muted/80"
              onClick={zoomIn}
              title="Zoom in"
            >
              +
            </button>
          </div>
          <button
            className="bg-muted border border-border/20 rounded px-2.5 py-0.5 text-foreground text-[0.7em] cursor-pointer transition-all duration-200 hover:bg-muted/80 hover:-translate-y-px active:translate-y-0"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            aria-label="Copy code"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>
      <div className="p-4 overflow-auto" onWheel={handleWheel}>
        <div style={{ zoom }}>
          <MermaidRenderer code={code} />
        </div>
      </div>
      <div className="px-2.5 py-1 text-[0.6em] text-muted-foreground/30 text-right">
{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+scroll to zoom · Scroll to pan
      </div>
    </div>
  );
}

export function CodeBlock({ language, children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lang = language || className?.replace('language-', '') || 'text';

  if (lang === 'mermaid' || lang === 'mmd') {
    return <MermaidBlock code={String(children).replace(/\n$/, '')} />;
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(String(children));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-md overflow-hidden bg-muted border border-border">
      {lang && lang !== 'text' && (
        <div className="py-1 px-2.5 bg-background/50 border-b border-border flex justify-between items-center">
          <span className="text-[0.7em] text-muted-foreground/50 uppercase tracking-wide">{lang}</span>
          <button
            className="bg-muted border border-border/20 rounded px-2.5 py-0.5 text-foreground text-[0.7em] cursor-pointer transition-all duration-200 hover:bg-muted/80 hover:-translate-y-px active:translate-y-0"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      )}
      <SyntaxHighlighter
        language={lang}
        style={vscDarkPlus}
        wrapLongLines={true}
        customStyle={{
          margin: 0,
          borderRadius: lang !== 'text' ? '0 0 6px 6px' : '6px',
          fontSize: '0.85em',
        }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
}
