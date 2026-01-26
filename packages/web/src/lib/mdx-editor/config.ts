/**
 * MDXEditor plugin configuration for spec review feature.
 * Configures all required plugins for rich markdown editing.
 */

import { createElement } from 'react';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { Prec } from '@codemirror/state';
import {
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  markdownShortcutPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  directivesPlugin,
  AdmonitionDirectiveDescriptor,
  type DirectiveDescriptor,
  imagePlugin,
  type RealmPlugin,
  // Toolbar imports
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertTable,
  ListsToggle,
  UndoRedo,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
  CodeToggle,
  InsertCodeBlock,
  Separator,
} from '@mdxeditor/editor';

/**
 * Dark CodeMirror highlight style to override the bundled basic-light theme.
 * Wrapped in Prec.highest so it wins over the hardcoded basicLight in MDXEditor.
 */
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#ff7b72' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#ffa657' },
  { tag: [tags.propertyName], color: '#79c0ff' },
  { tag: [tags.variableName], color: '#ffa657' },
  { tag: [tags.function(tags.variableName)], color: '#d2a8ff' },
  { tag: [tags.labelName], color: '#79c0ff' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#79c0ff' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#a3be8c' },
  { tag: [tags.brace], color: '#c9d1d9' },
  { tag: [tags.annotation], color: '#d2a8ff' },
  { tag: [tags.number, tags.changed, tags.modifier, tags.self, tags.namespace], color: '#79c0ff' },
  { tag: [tags.typeName, tags.className], color: '#ffa657' },
  { tag: [tags.operator, tags.operatorKeyword], color: '#ff7b72' },
  { tag: [tags.tagName], color: '#7ee787' },
  { tag: [tags.squareBracket], color: '#c9d1d9' },
  { tag: [tags.angleBracket], color: '#c9d1d9' },
  { tag: [tags.attributeName], color: '#79c0ff' },
  { tag: [tags.regexp], color: '#a5d6ff' },
  { tag: [tags.quote], color: '#8b949e' },
  { tag: [tags.string], color: '#a5d6ff' },
  { tag: tags.link, color: '#58a6ff', textDecoration: 'underline' },
  { tag: [tags.url, tags.escape, tags.special(tags.string)], color: '#a5d6ff' },
  { tag: [tags.meta], color: '#79c0ff' },
  { tag: [tags.comment], color: '#b8c4ce', fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold', color: '#e6edf3' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#e6edf3' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.heading, fontWeight: 'bold', color: '#e6edf3' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#79c0ff' },
  { tag: [tags.processingInstruction, tags.inserted], color: '#7ee787' },
  { tag: tags.invalid, color: '#f85149', borderBottom: '1px dotted #f85149' },
]);

const darkCodeMirrorExtensions = [
  Prec.highest(syntaxHighlighting(darkHighlightStyle)),
];

/**
 * Generic directive descriptor that renders unknown directives as plain text.
 * This prevents parsing errors for directives like :Now or other unrecognized formats.
 */
const GenericDirectiveDescriptor: DirectiveDescriptor = {
  name: '*',
  type: 'textDirective',
  testNode(node) {
    return node.type === 'textDirective';
  },
  attributes: [],
  hasChildren: false,
  Editor: ({ mdastNode }) => {
    // Render the directive as plain text with the colon prefix
    return createElement('span', null, `:${mdastNode.name}`);
  },
};

/**
 * Creates the plugin configuration array for MDXEditor.
 * Includes all plugins needed for spec review editing:
 * - headings: H1-H6 heading support
 * - lists: ordered and unordered lists
 * - quote: blockquote support
 * - codeBlock: fenced code blocks with syntax highlighting
 * - codeMirror: syntax highlighting engine with language support
 * - image: image insertion and display
 * - link: hyperlink support with dialog
 * - table: GFM table support
 * - markdownShortcut: keyboard shortcuts for markdown formatting
 * - frontmatter: YAML frontmatter support
 * - directives: admonition blocks (:::note, :::warning, etc.)
 * - diffSource: view mode for showing diff/source
 *
 * @returns Array of configured MDXEditor plugins
 */
export function createEditorPlugins(): RealmPlugin[] {
  return [
    // Core structure plugins
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),

    // Link and image plugins
    linkPlugin(),
    linkDialogPlugin(),
    imagePlugin({
      // Allow images from any source
      imageUploadHandler: async () => {
        // No upload - just return the URL as-is
        return '';
      },
    }),

    // Frontmatter and directives
    frontmatterPlugin(),
    directivesPlugin({
      directiveDescriptors: [
        AdmonitionDirectiveDescriptor,
        GenericDirectiveDescriptor, // Fallback for unknown directives
      ],
    }),

    // Code block plugins (must come together)
    codeBlockPlugin({
      defaultCodeBlockLanguage: '',
    }),
    codeMirrorPlugin({
      codeMirrorExtensions: darkCodeMirrorExtensions,
      codeBlockLanguages: {
        // Default / fallback
        '': 'Plain Text',
        text: 'Plain Text',
        plaintext: 'Plain Text',
        txt: 'Plain Text',

        // JavaScript / TypeScript
        typescript: 'TypeScript',
        ts: 'TypeScript',
        tsx: 'TypeScript',
        javascript: 'JavaScript',
        js: 'JavaScript',
        jsx: 'JavaScript',
        json: 'JSON',
        jsonc: 'JSON',

        // Shell
        bash: 'Bash',
        sh: 'Bash',
        shell: 'Bash',
        zsh: 'Bash',
        powershell: 'PowerShell',
        ps1: 'PowerShell',
        cmd: 'Bash',

        // Config / Data
        yaml: 'YAML',
        yml: 'YAML',
        toml: 'TOML',
        ini: 'INI',
        xml: 'XML',

        // Web
        html: 'HTML',
        htm: 'HTML',
        css: 'CSS',
        scss: 'CSS',
        less: 'CSS',

        // Backend languages
        python: 'Python',
        py: 'Python',
        csharp: 'C#',
        cs: 'C#',
        'c#': 'C#',
        java: 'Java',
        go: 'Go',
        golang: 'Go',
        rust: 'Rust',
        rs: 'Rust',
        ruby: 'Ruby',
        rb: 'Ruby',
        php: 'PHP',
        swift: 'Swift',
        kotlin: 'Kotlin',
        kt: 'Kotlin',
        scala: 'Scala',

        // C family
        c: 'C',
        cpp: 'C++',
        'c++': 'C++',
        h: 'C',
        hpp: 'C++',
        objc: 'Objective-C',

        // Database
        sql: 'SQL',
        mysql: 'SQL',
        pgsql: 'SQL',
        postgresql: 'SQL',
        graphql: 'GraphQL',
        gql: 'GraphQL',

        // Markup / Docs
        markdown: 'Markdown',
        md: 'Markdown',
        mdx: 'Markdown',

        // DevOps / Config
        dockerfile: 'Docker',
        docker: 'Docker',
        nginx: 'Nginx',
        apache: 'Apache',

        // Data formats
        csv: 'Plain Text',
        diff: 'Diff',
        patch: 'Diff',

        // Other
        regex: 'Plain Text',
        http: 'HTTP',
        makefile: 'Makefile',
        make: 'Makefile',
        proto: 'Protocol Buffers',
        protobuf: 'Protocol Buffers',
      },
    }),
    tablePlugin(),
    markdownShortcutPlugin(),
    diffSourcePlugin({
      viewMode: 'rich-text',
    }),
    // Toolbar plugin with formatting controls
    toolbarPlugin({
      toolbarContents: () =>
        createElement(
          'div',
          { style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } },
          createElement(UndoRedo, null),
          createElement(Separator, null),
          createElement(BoldItalicUnderlineToggles, null),
          createElement(CodeToggle, null),
          createElement(Separator, null),
          createElement(BlockTypeSelect, null),
          createElement(Separator, null),
          createElement(ListsToggle, null),
          createElement(Separator, null),
          createElement(CreateLink, null),
          createElement(InsertTable, null),
          createElement(InsertThematicBreak, null),
          createElement(InsertCodeBlock, null),
          createElement(Separator, null),
          createElement(DiffSourceToggleWrapper, { children: null })
        ),
    }),
  ];
}

/**
 * Default plugin array for convenience.
 * Pre-configured with all required plugins.
 */
export const editorPlugins = createEditorPlugins();
