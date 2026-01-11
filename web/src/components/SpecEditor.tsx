/**
 * SpecEditor component - wraps MDXEditor for spec content editing.
 * Provides WYSIWYG markdown editing with programmatic ref access.
 */

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  diffSourcePlugin,
  type ViewMode,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { createEditorPlugins } from '../lib/mdx-editor/config';

export interface SpecEditorProps {
  /**
   * The markdown content to display in the editor.
   */
  content: string;
  /**
   * Called when the editor content changes.
   */
  onChange?: (content: string) => void;
  /**
   * Initial view mode - 'rich-text' for WYSIWYG, 'source' for raw markdown.
   * @default 'rich-text'
   */
  viewMode?: ViewMode;
  /**
   * CSS class name to apply to the editor container.
   */
  className?: string;
  /**
   * Placeholder text shown when editor is empty.
   */
  placeholder?: string;
  /**
   * Whether to auto-focus the editor on mount.
   */
  autoFocus?: boolean;
}

export interface SpecEditorRef {
  /**
   * Gets the current markdown content.
   */
  getMarkdown: () => string;
  /**
   * Sets the markdown content.
   */
  setMarkdown: (content: string) => void;
  /**
   * Focuses the editor.
   */
  focus: () => void;
  /**
   * Inserts markdown at the current cursor position.
   */
  insertMarkdown: (content: string) => void;
  /**
   * Gets the underlying MDXEditor methods for advanced operations.
   */
  getEditorMethods: () => MDXEditorMethods | null;
}

/**
 * SpecEditor component that wraps MDXEditor for spec review editing.
 * Exposes a ref for programmatic control and supports WYSIWYG/source view modes.
 */
export const SpecEditor = forwardRef<SpecEditorRef, SpecEditorProps>(function SpecEditor(
  { content, onChange, viewMode = 'rich-text', className, placeholder, autoFocus },
  ref
) {
  const editorRef = useRef<MDXEditorMethods>(null);

  const handleChange: MDXEditorProps['onChange'] = useCallback(
    (markdown: string) => {
      onChange?.(markdown);
    },
    [onChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => editorRef.current?.getMarkdown() ?? '',
      setMarkdown: (newContent: string) => editorRef.current?.setMarkdown(newContent),
      focus: () => editorRef.current?.focus(),
      insertMarkdown: (markdown: string) => editorRef.current?.insertMarkdown(markdown),
      getEditorMethods: () => editorRef.current,
    }),
    []
  );

  const plugins = createEditorPluginsWithViewMode(viewMode);

  return (
    <div className={`spec-editor ${className ?? ''}`} data-testid="spec-editor">
      <MDXEditor
        ref={editorRef}
        markdown={content}
        onChange={handleChange}
        plugins={plugins}
        placeholder={placeholder}
        autoFocus={autoFocus}
        contentEditableClassName="spec-editor-content"
      />
    </div>
  );
});

/**
 * Creates plugins with the specified view mode for diffSourcePlugin.
 */
function createEditorPluginsWithViewMode(viewMode: ViewMode): MDXEditorProps['plugins'] {
  const basePlugins = createEditorPlugins();

  const pluginsWithoutDiffSource = basePlugins.filter(
    (plugin) => {
      const pluginName = (plugin as { pluginId?: string })?.pluginId;
      return pluginName !== 'diff-source';
    }
  );

  return [
    ...pluginsWithoutDiffSource,
    diffSourcePlugin({
      viewMode,
    }),
  ];
}
