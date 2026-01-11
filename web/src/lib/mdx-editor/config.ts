/**
 * MDXEditor plugin configuration for spec review feature.
 * Configures all required plugins for rich markdown editing.
 */

import {
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  codeBlockPlugin,
  tablePlugin,
  markdownShortcutPlugin,
  diffSourcePlugin,
  type RealmPlugin,
} from '@mdxeditor/editor';

/**
 * Creates the plugin configuration array for MDXEditor.
 * Includes all plugins needed for spec review editing:
 * - headings: H1-H6 heading support
 * - lists: ordered and unordered lists
 * - quote: blockquote support
 * - codeBlock: fenced code blocks with syntax highlighting
 * - table: GFM table support
 * - markdownShortcut: keyboard shortcuts for markdown formatting
 * - diffSource: view mode for showing diff/source
 *
 * @returns Array of configured MDXEditor plugins
 */
export function createEditorPlugins(): RealmPlugin[] {
  return [
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    codeBlockPlugin({
      defaultCodeBlockLanguage: 'typescript',
    }),
    tablePlugin(),
    markdownShortcutPlugin(),
    diffSourcePlugin({
      viewMode: 'rich-text',
    }),
  ];
}

/**
 * Default plugin array for convenience.
 * Pre-configured with all required plugins.
 */
export const editorPlugins = createEditorPlugins();
