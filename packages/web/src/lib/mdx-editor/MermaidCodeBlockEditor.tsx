/**
 * Custom MDXEditor code block editor for mermaid diagrams.
 * Shows a textarea for editing and a live SVG preview.
 * In read-only mode, only the SVG preview is visible (via CSS).
 */
import { useState, useCallback } from 'react';
import {
  useCodeBlockEditorContext,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps,
} from '@mdxeditor/editor';
import { MermaidRenderer } from '../mermaid/MermaidRenderer';

function MermaidEditor({ code }: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  const [showSource, setShowSource] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCode(e.target.value);
    },
    [setCode],
  );

  return (
    <div className="mermaid-editor-block">
      <div className="mermaid-editor-header">
        <span className="mermaid-editor-label">Mermaid</span>
        <button
          type="button"
          className="mermaid-editor-toggle"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? 'Preview' : 'Edit source'}
        </button>
      </div>

      {showSource && (
        <textarea
          className="mermaid-editor-textarea"
          value={code}
          onChange={handleChange}
          spellCheck={false}
          rows={Math.max(3, code.split('\n').length)}
        />
      )}

      <div className="mermaid-editor-preview">
        <MermaidRenderer code={code} />
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
