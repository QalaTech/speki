/**
 * SpecEditor component - wraps MDXEditor for spec content editing.
 * Provides WYSIWYG markdown editing with programmatic ref access.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useMemo, useState } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  diffSourcePlugin,
  type ViewMode,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import '../../lib/mdx-editor/dark-theme.css';
import { createEditorPlugins } from '../../lib/mdx-editor/config';
import { sanitizeForMdx } from '../../features/editor';
import { SelectionAskDialog } from './SelectionAskDialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';

interface SelectionState {
  text: string;
  top: number;
  left: number;
}

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
  /**
   * Called when user selects text and submits a question in read-only mode.
   * Enables context-aware chat by passing the selected text and user's question.
   */
  onSelectionAsk?: (selectedText: string, question: string) => void;
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
  /**
   * Scrolls the editor to a specific line number with smooth animation.
   */
  scrollToLine: (lineStart: number, lineEnd?: number) => void;
  /**
   * Scrolls the editor to content matching the given section name.
   */
  scrollToSection: (sectionName: string) => void;
}

/**
 * SpecEditor component that wraps MDXEditor for spec review editing.
 * Exposes a ref for programmatic control and supports WYSIWYG/source view modes.
 */
export const SpecEditor = forwardRef<SpecEditorRef, SpecEditorProps>(function SpecEditor(
  { content, onChange, viewMode = 'rich-text', diffMarkdown, className, placeholder, autoFocus, readOnly = false, onSelectionAsk },
  ref
) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncingExternalContentRef = useRef(false);
  const syncResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);

  // Sanitize content to escape problematic angle brackets
  const sanitizedContent = useMemo(() => sanitizeForMdx(content), [content]);

  // Keep MDXEditor's internal document in sync with external content updates.
  // MDXEditor treats `markdown` as initial content, so explicit syncing is
  // required after external refetches (e.g. applying changes from DiffOverlay).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentMarkdown = editor.getMarkdown();
    if (sanitizeForMdx(currentMarkdown) === sanitizedContent) return;

    isSyncingExternalContentRef.current = true;
    editor.setMarkdown(sanitizedContent);

    if (syncResetTimerRef.current) {
      clearTimeout(syncResetTimerRef.current);
    }
    syncResetTimerRef.current = setTimeout(() => {
      isSyncingExternalContentRef.current = false;
      syncResetTimerRef.current = null;
    }, 0);
  }, [sanitizedContent]);

  const handleChange: MDXEditorProps['onChange'] = useCallback(
    (markdown: string) => {
      // Don't trigger onChange if we're currently syncing from external content
      if (isSyncingExternalContentRef.current) {
        return;
      }

      // Avoid redundant updates if content is effectively the same as what we have.
      // We check against both the raw content prop and the sanitized version we're using.
      if (markdown === content || markdown === sanitizedContent) {
        return;
      }

      // If they are different, it might still be just a normalization difference (e.g. line endings)
      // so we do one more check against sanitized versions if they are large enough to matter.
      if (markdown.length === sanitizedContent.length || Math.abs(markdown.length - sanitizedContent.length) < 5) {
        if (sanitizeForMdx(markdown) === sanitizedContent) {
          return;
        }
      }

      console.log('[SpecEditor] handleChange called, markdown length:', markdown.length, 'hasOnChange:', !!onChange);
      onChange?.(markdown);
    },
    [onChange, content, sanitizedContent]
  );

  useEffect(() => {
    return () => {
      if (syncResetTimerRef.current) {
        clearTimeout(syncResetTimerRef.current);
      }
    };
  }, []);

  // Handle MDXEditor parsing errors
  const handleError = useCallback((payload: { error: string; source: string }) => {
    console.warn('[SpecEditor] Parse error:', payload);
    setParseError(payload.error);
  }, []);

  // Hide code block controls in readonly mode (JavaScript fallback for CSS)
  useEffect(() => {
    if (!readOnly || !containerRef.current) return;

    const hideCodeBlockControls = () => {
      const container = containerRef.current;
      if (!container) return;

      // Find and hide code block headers/toolbars
      const selectors = [
        '[class*="_codeBlockHeader_"]',
        '[class*="_codeBlockToolbar_"]',
        '[class*="CodeBlockToolbar"]',
      ];

      selectors.forEach(selector => {
        const elements = container.querySelectorAll(selector);
        elements.forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      });

      // Also hide individual select and button elements in code blocks
      const codeBlocks = container.querySelectorAll('[class*="codeBlock"], [class*="CodeBlock"], pre');
      codeBlocks.forEach(block => {
        const selects = block.querySelectorAll('select');
        const buttons = block.querySelectorAll('button');
        
        selects.forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
        
        buttons.forEach(el => {
          // Don't hide CodeMirror buttons
          if (!(el as HTMLElement).closest('.cm-editor')) {
            (el as HTMLElement).style.display = 'none';
          }
        });
      });
    };

    // Run immediately and also after a small delay (in case MDXEditor renders controls async)
    hideCodeBlockControls();
    const timer = setTimeout(hideCodeBlockControls, 100);

    // Set up a mutation observer to catch dynamically added controls
    const observer = new MutationObserver(hideCodeBlockControls);
    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [readOnly, content]); // Re-run when content changes (new code blocks might be added)

  // Text selection handling for "Ask about this" feature in read-only mode
  useEffect(() => {
    if (!readOnly || !onSelectionAsk || !containerRef.current) return;

    const container = containerRef.current;

    const handleSelectionChange = () => {
      const sel = window.getSelection();

      // If selection is empty/collapsed, only clear if NOT clicking on dialog
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        // Don't clear selection if the dialog is visible and user is interacting with it
        // The dialog handles its own close via onClose callback
        return;
      }

      const selectedText = sel.toString().trim();
      if (!selectedText || selectedText.length < 3) {
        // Don't clear - might be clicking on dialog
        return;
      }

      // Check if selection is within our editor container
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        // Selection moved outside container - but don't clear if dialog is open
        return;
      }

      // Get position for the floating button
      const rect = range.getBoundingClientRect();
      setSelection({
        text: selectedText,
        top: rect.bottom + 8,
        left: rect.left + (rect.width / 2),
      });
    };

    // Listen for mouse up (selection completion) and selection changes
    const handleMouseUp = () => {
      // Small delay to let selection finalize
      setTimeout(handleSelectionChange, 10);
    };

    // Clear selection when clicking elsewhere or pressing Escape
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't clear if clicking the ask dialog or any of its children
      if (target.closest('[data-selection-ask-dialog]')) return;

      // Clear selection state (the dialog handles its own close)
      setSelection(null);
    };

    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [readOnly, onSelectionAsk]);

  // Handler for the Ask dialog submission
  const handleAskSubmit = useCallback((selectedText: string, question: string) => {
    if (onSelectionAsk) {
      onSelectionAsk(selectedText, question);
      setSelection(null);
      // Clear the browser selection
      window.getSelection()?.removeAllRanges();
    }
  }, [onSelectionAsk]);

  // Handler to close the dialog
  const handleAskClose = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => editorRef.current?.getMarkdown() ?? '',
      setMarkdown: (newContent: string) => editorRef.current?.setMarkdown(newContent),
      focus: () => editorRef.current?.focus(),
      insertMarkdown: (markdown: string) => editorRef.current?.insertMarkdown(markdown),
      getEditorMethods: () => editorRef.current,
      scrollToLine: (lineStart: number, _lineEnd?: number) => {
        const container = containerRef.current;
        if (!container) {
          console.warn('[scrollToLine-v3] No container ref');
          return;
        }

        const scrollableArea = [
          container.querySelector('.mdxeditor-root-contenteditable'),
          container.querySelector('[contenteditable="true"]'),
          container.querySelector('.mdxeditor'),
          container.querySelector('.spec-editor-content'),
        ].find(el => el !== null) as HTMLElement;

        if (!scrollableArea) {
          console.warn('[scrollToLine-v3] No scrollable area found');
          return;
        }

        const markdown = editorRef.current?.getMarkdown() ?? '';
        const lines = markdown.split('\n');
        const targetLine = lines[lineStart - 1] || '';
        
        // Aggressive normalization
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const rawText = targetLine.trim().replace(/^#+\s*/, '').replace(/[*_`~\[\](){}]/g, '').trim();
        const normalizedSearch = normalize(rawText);

        console.log('[scrollToLine-v3] Searching for:', rawText, 'at line', lineStart);

        if (!normalizedSearch) {
          console.warn('[scrollToLine-v3] No searchable text at line', lineStart);
          return;
        }

        const allElements = scrollableArea.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, pre, div, span, strong, em');
        let targetElement: HTMLElement | null = null;

        // Try exact match first
        for (const elem of allElements) {
          if (normalize(elem.textContent || '').includes(normalizedSearch)) {
            targetElement = elem as HTMLElement;
            break;
          }
        }

        // Fallback: word-based fuzzy match
        if (!targetElement) {
          const words = rawText.split(/\s+/).filter(w => w.length > 3);
          if (words.length > 0) {
            for (const elem of allElements) {
              const text = normalize(elem.textContent || '');
              const matches = words.filter(w => text.includes(w.toLowerCase())).length;
              if (matches >= words.length * 0.7) {
                targetElement = elem as HTMLElement;
                break;
              }
            }
          }
        }

        if (!targetElement) {
          console.warn('[scrollToLine-v3] Not found:', rawText);
          return;
        }

        // Action: Scroll and Highlight
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        const originalOutline = targetElement.style.outline;
        const originalBoxShadow = targetElement.style.boxShadow;
        const originalTransition = targetElement.style.transition;
        const originalZIndex = targetElement.style.zIndex;

        targetElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        targetElement.style.outline = '3px solid #3b82f6';
        targetElement.style.outlineOffset = '4px';
        targetElement.style.boxShadow = '0 0 0 1000px rgba(59, 130, 246, 0.05)';
        targetElement.style.zIndex = '10';

        setTimeout(() => {
          if (targetElement) {
            targetElement.style.outline = '0px solid transparent';
            targetElement.style.boxShadow = 'none';
            setTimeout(() => {
              if (targetElement) {
                targetElement.style.outline = originalOutline;
                targetElement.style.boxShadow = originalBoxShadow;
                targetElement.style.transition = originalTransition;
                targetElement.style.zIndex = originalZIndex;
              }
            }, 600);
          }
        }, 2500);
      },
      scrollToSection: (sectionName: string) => {
        const container = containerRef.current;
        if (!container) return;

        const scrollableArea = [
          container.querySelector('.mdxeditor-root-contenteditable'),
          container.querySelector('[contenteditable="true"]'),
        ].find(el => el !== null) as HTMLElement;

        if (!scrollableArea) return;

        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const searchTerms = [
          normalize(sectionName),
          normalize(sectionName.split(':').pop() || ''),
          normalize(sectionName.replace(/^(Feature|Section|Chapter)\s+\d+:\s*/i, ''))
        ].filter(t => t.length > 2);

        console.log('[scrollToSection-v3] Searching for section:', sectionName, 'Terms:', searchTerms);

        const headings = scrollableArea.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, p');
        let targetElement: HTMLElement | null = null;

        for (const elem of headings) {
          const text = normalize(elem.textContent || '');
          if (searchTerms.some(term => text === term || text.includes(term))) {
            targetElement = elem as HTMLElement;
            break;
          }
        }

        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Flash highlight
          const originalBg = targetElement.style.background;
          targetElement.style.transition = 'background 0.3s ease';
          targetElement.style.background = 'rgba(59, 130, 246, 0.2)';
          targetElement.style.borderRadius = '4px';
          
          setTimeout(() => {
            if (targetElement) targetElement.style.background = originalBg;
          }, 2000);
        } else {
          console.warn('[scrollToSection-v3] Not found:', sectionName);
        }
      },
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
    <div ref={containerRef} className={`spec-editor ${className ?? ''} ${readOnly ? 'spec-editor--readonly' : ''} relative`} data-testid="spec-editor">
      {parseError && (
        <Alert variant="warning" className="mb-2 py-2 text-sm">
          <div className="flex items-center justify-between w-full">
            <span>⚠️ Some content couldn't be parsed in rich-text mode. Showing source view.</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setParseError(null)}
            >
              Try Again
            </Button>
          </div>
        </Alert>
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
        suppressHtmlProcessing={true}
      />

      {/* Selection dialog - appears when text is selected in read-only mode */}
      {selection && onSelectionAsk && (
        <SelectionAskDialog
          selectedText={selection.text}
          position={{ top: selection.top, left: selection.left }}
          onSubmit={handleAskSubmit}
          onClose={handleAskClose}
        />
      )}
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
