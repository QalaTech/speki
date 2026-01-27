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
  const previewRef = useRef<HTMLDivElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCode(e.target.value);
    },
    [setCode],
  );

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
    <div className="mermaid-editor-block">
      <div className="mermaid-editor-header">
        <span className="mermaid-editor-label">Mermaid</span>
        <div className="mermaid-editor-controls">
          <span className="mermaid-editor-hint">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+scroll to zoom</span>
          <div className="mermaid-zoom-controls">
            <button type="button" className="mermaid-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
            <button type="button" className="mermaid-zoom-btn mermaid-zoom-level" onClick={zoomReset} title="Reset zoom">
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

      <div className="mermaid-editor-preview" ref={previewRef} onWheel={handleWheel}>
        <div style={{ zoom }}>
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
