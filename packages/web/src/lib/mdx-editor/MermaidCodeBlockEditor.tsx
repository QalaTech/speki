/**
 * Custom MDXEditor code block editor for mermaid diagrams.
 * Shows a textarea for editing and a live SVG preview with zoom controls.
 * In read-only mode, only the SVG preview is visible (via CSS).
 */
import { useState, useCallback, useRef } from 'react';
import {
  useCodeBlockEditorContext,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps,
} from '@mdxeditor/editor';
import { MermaidRenderer } from '../mermaid/MermaidRenderer';

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

function MermaidEditor({ code }: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  const [showSource, setShowSource] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const previewRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCode(e.target.value);
    },
    [setCode],
  );

  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));
  const zoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => {
        // Dampen: scale by actual scroll delta instead of fixed step
        const delta = -e.deltaY * 0.002;
        return Math.min(Math.max(z + delta, ZOOM_MIN), ZOOM_MAX);
      });
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on left click, ignore if clicking buttons/textarea
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { ...pan };
    e.preventDefault();
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panOrigin.current.x + (e.clientX - panStart.current.x),
      y: panOrigin.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  return (
    <div className="mermaid-editor-block">
      <div className="mermaid-editor-header">
        <span className="mermaid-editor-label">Mermaid</span>
        <div className="mermaid-editor-controls">
          <span className="mermaid-editor-hint">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+scroll to zoom · drag to pan</span>
          <div className="mermaid-zoom-controls">
            <button type="button" className="mermaid-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
            <button type="button" className="mermaid-zoom-btn mermaid-zoom-level" onClick={zoomReset} title="Reset zoom & pan">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="mermaid-zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
          </div>
          <button
            type="button"
            className="mermaid-editor-toggle"
            onClick={() => setShowSource((v) => !v)}
          >
            {showSource ? 'Preview' : 'Edit source'}
          </button>
        </div>
      </div>

      {showSource && (
        <textarea
          className="mermaid-editor-textarea"
          value={code}
          onChange={handleChange}
          spellCheck={false}
          rows={Math.max(8, code.split('\n').length + 2)}
        />
      )}

      <div
        className="mermaid-editor-preview"
        ref={previewRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning.current ? 'grabbing' : 'grab', overflow: 'hidden' }}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}>
          <MermaidRenderer code={code} />
        </div>
      </div>
    </div>
  );
}

/**
 * CodeBlockEditorDescriptor for mermaid code blocks.
 * Priority 100 to match before the default CodeMirror catch-all.
 */
export const mermaidCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  priority: 100,
  match: (language) =>
    language === 'mermaid' || language === 'mmd',
  Editor: MermaidEditor,
};
