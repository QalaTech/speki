/**
 * MDXEditor plugin configuration for spec review feature.
 * Configures all required plugins for rich markdown editing.
 */

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
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    frontmatterPlugin(),
    codeBlockPlugin({
      defaultCodeBlockLanguage: '',
    }),
    codeMirrorPlugin({
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
    // Handle directives (:::note, :::warning, etc.)
    directivesPlugin({
      directiveDescriptors: [AdmonitionDirectiveDescriptor],
    }),
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
