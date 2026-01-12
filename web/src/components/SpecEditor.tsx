/**
 * SpecEditor component - wraps MDXEditor for spec content editing.
 * Provides WYSIWYG markdown editing with programmatic ref access.
 */

import { forwardRef, useCallback, useImperativeHandle, useRef, useMemo, useState } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  diffSourcePlugin,
  type ViewMode,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import '../lib/mdx-editor/dark-theme.css';
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
   * Initial view mode - 'rich-text' for WYSIWYG, 'source' for raw markdown, 'diff' for comparison.
   * @default 'rich-text'
   */
  viewMode?: ViewMode;
  /**
   * The original markdown content to compare against when in 'diff' mode.
   * Required when viewMode is 'diff'.
   */
  diffMarkdown?: string;
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
  /**
   * Whether the editor is read-only (preview mode).
   * @default false
   */
  readOnly?: boolean;
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
 * Sanitize markdown content for MDXEditor.
 * Escapes angle brackets that look like JSX/HTML tags but aren't valid HTML.
 * This prevents MDXEditor from trying to parse things like <string> or <T> as components.
 */
function sanitizeForMdx(content: string): string {
  // Don't process if content is empty
  if (!content) return content;

  // Pattern to find angle brackets that look like type parameters or invalid HTML
  // Matches <word> but NOT valid HTML tags like <div>, <span>, <a>, etc.
  const validHtmlTags = new Set([
    'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'blockquote', 'body',
    'br', 'button', 'canvas', 'caption', 'code', 'col', 'dd', 'details', 'div', 'dl',
    'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1',
    'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img',
    'input', 'label', 'legend', 'li', 'link', 'main', 'mark', 'meta', 'nav', 'noscript',
    'object', 'ol', 'option', 'p', 'param', 'picture', 'pre', 'progress', 'q', 's',
    'script', 'section', 'select', 'small', 'source', 'span', 'strong', 'style', 'sub',
    'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot',
    'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'video', 'wbr',
  ]);

  // Split by code blocks to avoid modifying content inside them
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return parts.map((part, index) => {
    // Odd indices are code blocks - don't modify
    if (index % 2 === 1) return part;

    // Replace invalid HTML-like tags with escaped versions
    return part.replace(/<(\/?[a-zA-Z][a-zA-Z0-9_-]*)([^>]*)>/g, (match, tagName, rest) => {
      const normalizedTag = tagName.replace('/', '').toLowerCase();
      if (validHtmlTags.has(normalizedTag)) {
        return match; // Keep valid HTML
      }
      // Escape the angle brackets
      return `\\<${tagName}${rest}\\>`;
    });
  }).join('');
}

/**
 * SpecEditor component that wraps MDXEditor for spec review editing.
 * Exposes a ref for programmatic control and supports WYSIWYG/source view modes.
 */
export const SpecEditor = forwardRef<SpecEditorRef, SpecEditorProps>(function SpecEditor(
  { content, onChange, viewMode = 'rich-text', diffMarkdown, className, placeholder, autoFocus, readOnly = false },
  ref
) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Sanitize content to escape problematic angle brackets
  const sanitizedContent = useMemo(() => sanitizeForMdx(content), [content]);

  const handleChange: MDXEditorProps['onChange'] = useCallback(
    (markdown: string) => {
      onChange?.(markdown);
    },
    [onChange]
  );

  // Handle MDXEditor parsing errors
  const handleError = useCallback((payload: { error: string; source: string }) => {
    console.warn('[SpecEditor] Parse error:', payload);
    setParseError(payload.error);
  }, []);

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

  // Memoize plugins - recreate only when viewMode or diffMarkdown changes
  const plugins = useMemo(
    () => createEditorPluginsWithViewMode(viewMode, diffMarkdown),
    [viewMode, diffMarkdown]
  );

  // Generate a key to force MDXEditor remount when switching modes
  // This is necessary because MDXEditor plugins are configured at initialization
  // NOTE: readOnly is NOT included - MDXEditor handles readOnly prop changes without remount
  const editorKey = useMemo(
    () => `editor-${viewMode}-${diffMarkdown ? 'with-diff' : 'no-diff'}`,
    [viewMode, diffMarkdown]
  );

  // Use source mode if there's a parse error
  const effectiveViewMode = parseError ? 'source' : viewMode;
  const effectivePlugins = useMemo(
    () => createEditorPluginsWithViewMode(effectiveViewMode, diffMarkdown),
    [effectiveViewMode, diffMarkdown]
  );

  return (
    <div className={`spec-editor ${className ?? ''} ${readOnly ? 'spec-editor--readonly' : ''}`} data-testid="spec-editor">
      {parseError && (
        <div className="spec-editor-error-banner">
          <span>⚠️ Some content couldn't be parsed in rich-text mode. Showing source view.</span>
          <button onClick={() => setParseError(null)}>Try Again</button>
        </div>
      )}
      <MDXEditor
        key={editorKey}
        ref={editorRef}
        markdown={sanitizedContent}
        onChange={handleChange}
        plugins={parseError ? effectivePlugins : plugins}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        contentEditableClassName="spec-editor-content"
        onError={handleError}
      />
    </div>
  );
});

/**
 * Creates plugins with the specified view mode for diffSourcePlugin.
 */
function createEditorPluginsWithViewMode(viewMode: ViewMode, diffMarkdown?: string): MDXEditorProps['plugins'] {
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
      diffMarkdown: diffMarkdown ?? '',
    }),
  ];
}
