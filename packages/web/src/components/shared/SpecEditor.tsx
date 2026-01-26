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
  const [parseError, setParseError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);

  // Sanitize content to escape problematic angle brackets
  const sanitizedContent = useMemo(() => sanitizeForMdx(content), [content]);

  const handleChange: MDXEditorProps['onChange'] = useCallback(
    (markdown: string) => {
      console.log('[SpecEditor] handleChange called, markdown length:', markdown.length, 'hasOnChange:', !!onChange);
      onChange?.(markdown);
    },
    [onChange]
  );

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
          console.warn('[scrollToLine] No container ref');
          return;
        }

        // Try multiple selectors to find the scrollable area
        const possibleContainers = [
          container.querySelector('.mdxeditor-root-contenteditable'),
          container.querySelector('[contenteditable="true"]'),
          container.querySelector('.mdxeditor'),
          container.querySelector('.spec-editor-content'),
        ];

        const scrollableArea = possibleContainers.find(el => el !== null) as HTMLElement;

        if (!scrollableArea) {
          console.warn('[scrollToLine] No scrollable area found');
          return;
        }

        console.log('[scrollToLine] Found scrollable area:', scrollableArea.className);

        // Get the markdown content and extract text at target lines
        const markdown = editorRef.current?.getMarkdown() ?? '';
        const lines = markdown.split('\n');

        // Get the text content at the target line (use first 50 chars as search string)
        const targetLine = lines[lineStart - 1] || '';
        const searchText = targetLine.trim().substring(0, 50).replace(/[#*_`[\]]/g, ''); // Strip markdown formatting

        console.log('[scrollToLine] Searching for text:', searchText, 'at line', lineStart);

        if (!searchText) {
          console.warn('[scrollToLine] No text content at target line');
          return;
        }

        // Find all text nodes and elements that might contain this text
        const allElements = scrollableArea.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, pre, div');
        let targetElement: HTMLElement | null = null;

        for (const elem of allElements) {
          const htmlElem = elem as HTMLElement;
          const elemText = htmlElem.textContent || '';

          // Check if this element contains our search text
          if (elemText.includes(searchText)) {
            targetElement = htmlElem;
            console.log('[scrollToLine] Found matching element:', htmlElem.tagName, htmlElem.textContent?.substring(0, 50));
            break;
          }
        }

        if (!targetElement) {
          console.warn('[scrollToLine] Could not find element with text:', searchText);
          return;
        }

        // Get scroll parent (might be the element itself or a parent)
        let scrollParent: HTMLElement | null = scrollableArea;
        while (scrollParent && scrollParent.scrollHeight <= scrollParent.clientHeight) {
          scrollParent = scrollParent.parentElement;
        }

        if (!scrollParent) {
          scrollParent = scrollableArea;
        }

        console.log('[scrollToLine] Scroll parent:', scrollParent.className);

        // Calculate position to center the target element in viewport
        const elementTop = targetElement.offsetTop;
        const elementHeight = targetElement.offsetHeight;
        const viewportHeight = scrollParent.clientHeight;
        const centeredPosition = Math.max(0, elementTop - (viewportHeight / 2) + (elementHeight / 2));

        console.log('[scrollToLine] Element top:', elementTop, 'height:', elementHeight, 'scrolling to:', centeredPosition);

        // Smooth scroll to position
        scrollParent.scrollTo({
          top: centeredPosition,
          behavior: 'smooth'
        });

        // Highlight the found element
        const originalBg = targetElement.style.background;
        const originalBorder = targetElement.style.border;
        const originalTransition = targetElement.style.transition;

        targetElement.style.transition = 'all 0.3s ease';
        targetElement.style.background = 'rgba(88, 166, 255, 0.15)';
        targetElement.style.border = '2px solid rgba(88, 166, 255, 0.4)';
        targetElement.style.borderRadius = '4px';

        setTimeout(() => {
          if (targetElement) {
            targetElement.style.transition = 'all 1s ease';
            targetElement.style.background = originalBg;
            targetElement.style.border = originalBorder;

            setTimeout(() => {
              if (targetElement) {
                targetElement.style.transition = originalTransition;
              }
            }, 1000);
          }
        }, 1500);
      },
      scrollToSection: (sectionName: string) => {
        const container = containerRef.current;
        if (!container) {
          console.warn('[scrollToSection] No container ref');
          return;
        }

        const scrollableArea = [
          container.querySelector('.mdxeditor-root-contenteditable'),
          container.querySelector('[contenteditable="true"]'),
          container.querySelector('.mdxeditor'),
        ].find(el => el !== null) as HTMLElement;

        if (!scrollableArea) {
          console.warn('[scrollToSection] No scrollable area found');
          return;
        }

        console.log('[scrollToSection] Searching for section:', sectionName);

        // Try to match section headings - strip common prefixes
        const searchTerms = [
          sectionName,
          sectionName.replace(/^(Feature|Section|Chapter)\s+\d+:\s*/i, ''),
          sectionName.split(':').pop()?.trim() || sectionName,
        ];

        console.log('[scrollToSection] Search terms:', searchTerms);

        // Search all headings
        const headings = scrollableArea.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let targetElement: HTMLElement | null = null;

        for (const heading of headings) {
          const headingText = (heading.textContent || '').trim();

          for (const term of searchTerms) {
            if (headingText.toLowerCase().includes(term.toLowerCase())) {
              targetElement = heading as HTMLElement;
              console.log('[scrollToSection] Found heading:', headingText);
              break;
            }
          }

          if (targetElement) break;
        }

        if (!targetElement) {
          // Fallback: search all text content
          const allElements = scrollableArea.querySelectorAll('p, div, li, td, th');
          for (const elem of allElements) {
            const text = (elem.textContent || '').trim();
            for (const term of searchTerms) {
              if (text.toLowerCase().includes(term.toLowerCase())) {
                targetElement = elem as HTMLElement;
                console.log('[scrollToSection] Found in element:', elem.tagName, text.substring(0, 50));
                break;
              }
            }
            if (targetElement) break;
          }
        }

        if (!targetElement) {
          console.warn('[scrollToSection] Could not find section:', sectionName);
          return;
        }

        // Get scroll parent
        let scrollParent: HTMLElement | null = scrollableArea;
        while (scrollParent && scrollParent.scrollHeight <= scrollParent.clientHeight) {
          scrollParent = scrollParent.parentElement;
        }
        if (!scrollParent) scrollParent = scrollableArea;

        // Center in viewport
        const elementTop = targetElement.offsetTop;
        const elementHeight = targetElement.offsetHeight;
        const viewportHeight = scrollParent.clientHeight;
        const centeredPosition = Math.max(0, elementTop - (viewportHeight / 2) + (elementHeight / 2));

        console.log('[scrollToSection] Scrolling to:', centeredPosition);

        scrollParent.scrollTo({
          top: centeredPosition,
          behavior: 'smooth'
        });

        // Highlight
        const originalBg = targetElement.style.background;
        const originalBorder = targetElement.style.border;

        targetElement.style.transition = 'all 0.3s ease';
        targetElement.style.background = 'rgba(88, 166, 255, 0.2)';
        targetElement.style.border = '2px solid rgba(88, 166, 255, 0.6)';
        targetElement.style.borderRadius = '4px';
        targetElement.style.padding = '8px';

        setTimeout(() => {
          if (targetElement) {
            targetElement.style.transition = 'all 1s ease';
            targetElement.style.background = originalBg;
            targetElement.style.border = originalBorder;
          }
        }, 2000);
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
        <div className="alert alert-warning mb-2 py-2 text-sm">
          <span>⚠️ Some content couldn't be parsed in rich-text mode. Showing source view.</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setParseError(null)}>Try Again</button>
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
