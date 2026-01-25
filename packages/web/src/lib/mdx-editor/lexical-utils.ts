/**
 * Lexical editor utilities for the spec review feature.
 * Provides functions for scrolling to sections, highlighting text,
 * and finding/selecting content within the MDXEditor.
 */

import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
  $createRangeSelection,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
  type ElementNode,
} from 'lexical';
import { $isHeadingNode, type HeadingNode } from '@lexical/rich-text';

/**
 * Result from finding a node by text.
 */
export interface FindNodeResult {
  /** The found node containing the text */
  node: LexicalNode;
  /** The offset within the node where the text starts */
  offset: number;
  /** The DOM element associated with the node */
  element: HTMLElement | null;
}

/**
 * Options for highlighting text.
 */
export interface HighlightOptions {
  /** CSS class to apply for highlighting. @default 'lexical-highlight' */
  className?: string;
  /** Background color for the highlight. @default '#ffeb3b' */
  backgroundColor?: string;
}

const DEFAULT_HIGHLIGHT_CLASS = 'lexical-highlight';
const DEFAULT_HIGHLIGHT_COLOR = '#ffeb3b';

/**
 * Scrolls the editor to display the section with the specified heading.
 * Finds the first heading that matches the text and scrolls it into view.
 *
 * @param editor - The Lexical editor instance
 * @param sectionHeading - The heading text to scroll to
 * @returns True if the section was found and scrolled to, false otherwise
 */
export function scrollToSection(editor: LexicalEditor, sectionHeading: string): boolean {
  let found = false;

  editor.read(() => {
    const root = $getRoot();
    const headingNode = findHeadingByText(root, sectionHeading);

    if (headingNode) {
      const element = editor.getElementByKey(headingNode.getKey());
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        found = true;
      }
    }
  });

  return found;
}

/**
 * Scrolls the editor to display the specified line number.
 * Line numbers are 1-indexed.
 *
 * @param editor - The Lexical editor instance
 * @param lineNumber - The 1-indexed line number to scroll to
 * @returns True if the line was found and scrolled to, false otherwise
 */
export function scrollToLine(editor: LexicalEditor, lineNumber: number): boolean {
  if (lineNumber < 1) {
    return false;
  }

  let found = false;

  editor.read(() => {
    const root = $getRoot();
    const children = root.getChildren();
    const targetIndex = lineNumber - 1;

    if (targetIndex < children.length) {
      const targetNode = children[targetIndex];
      const element = editor.getElementByKey(targetNode.getKey());
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        found = true;
      }
    }
  });

  return found;
}

/**
 * Applies a temporary highlight to text matching the specified snippet.
 * The highlight fades after the specified duration.
 *
 * @param editor - The Lexical editor instance
 * @param textSnippet - The text to highlight
 * @param duration - Duration in milliseconds before the highlight fades. @default 2000
 * @param options - Optional highlight styling options
 * @returns A cleanup function to remove the highlight early, or null if text not found
 */
export function highlightText(
  editor: LexicalEditor,
  textSnippet: string,
  duration: number = 2000,
  options?: HighlightOptions
): (() => void) | null {
  const className = options?.className ?? DEFAULT_HIGHLIGHT_CLASS;
  const backgroundColor = options?.backgroundColor ?? DEFAULT_HIGHLIGHT_COLOR;

  const result = findNodeByText(editor, textSnippet);
  const element = result?.element;

  if (!element) {
    return null;
  }

  const originalBackground = element.style.backgroundColor;
  const originalTransition = element.style.transition;

  element.classList.add(className);
  element.style.backgroundColor = backgroundColor;
  element.style.transition = 'background-color 0.5s ease-out';

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const cleanup = (): void => {
    element.classList.remove(className);
    element.style.backgroundColor = originalBackground;
    element.style.transition = originalTransition;
  };

  const timeoutId = setTimeout(() => {
    element.style.backgroundColor = originalBackground;
    setTimeout(cleanup, 500);
  }, duration);

  return (): void => {
    clearTimeout(timeoutId);
    cleanup();
  };
}

/**
 * Finds a Lexical node containing the specified text.
 *
 * @param editor - The Lexical editor instance
 * @param text - The text to search for
 * @returns The find result with node, offset, and element, or null if not found
 */
export function findNodeByText(editor: LexicalEditor, text: string): FindNodeResult | null {
  let result: FindNodeResult | null = null;

  editor.read(() => {
    result = findNodeByTextInternal(editor, text);
  });

  return result;
}

/**
 * Gets the currently selected text from the editor.
 *
 * @param editor - The Lexical editor instance
 * @returns The selected text, or an empty string if no selection
 */
export function getSelectedText(editor: LexicalEditor): string {
  let selectedText = '';

  editor.read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selectedText = selection.getTextContent();
    }
  });

  return selectedText;
}

/**
 * Selects text in the editor that matches the specified snippet.
 *
 * @param editor - The Lexical editor instance
 * @param textSnippet - The text to select
 * @returns True if text was found and selected, false otherwise
 */
export function selectText(editor: LexicalEditor, textSnippet: string): boolean {
  let success = false;

  editor.update(() => {
    const root = $getRoot();
    const textNodes = getAllTextNodes(root);

    for (const textNode of textNodes) {
      const nodeText = textNode.getTextContent();
      const index = nodeText.indexOf(textSnippet);

      if (index !== -1) {
        const selection = $createRangeSelection();
        selection.anchor.set(textNode.getKey(), index, 'text');
        selection.focus.set(textNode.getKey(), index + textSnippet.length, 'text');
        $setSelection(selection);
        success = true;
        break;
      }
    }
  });

  return success;
}

/**
 * Internal helper to find a node by text within a read context.
 */
function findNodeByTextInternal(editor: LexicalEditor, text: string): FindNodeResult | null {
  const root = $getRoot();
  const textNodes = getAllTextNodes(root);

  for (const textNode of textNodes) {
    const nodeText = textNode.getTextContent();
    const index = nodeText.indexOf(text);

    if (index !== -1) {
      const element = editor.getElementByKey(textNode.getKey());
      return {
        node: textNode,
        offset: index,
        element,
      };
    }
  }

  return null;
}

/**
 * Finds a heading node by its text content.
 */
function findHeadingByText(root: ElementNode, headingText: string): HeadingNode | null {
  const children = root.getChildren();
  const normalizedSearch = headingText.toLowerCase().trim();

  for (const child of children) {
    if ($isHeadingNode(child)) {
      const nodeText = child.getTextContent().toLowerCase().trim();
      if (nodeText === normalizedSearch || nodeText.includes(normalizedSearch)) {
        return child;
      }
    }
  }

  return null;
}

/**
 * Recursively gets all text nodes from a node tree.
 */
function getAllTextNodes(node: LexicalNode): TextNode[] {
  if ($isTextNode(node)) {
    return [node];
  }
  if ($isElementNode(node)) {
    return node.getChildren().flatMap(getAllTextNodes);
  }
  return [];
}
