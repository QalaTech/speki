/**
 * ChatMarkdown - Lightweight markdown renderer for chat bubbles.
 * Uses react-markdown with GitHub Flavored Markdown (GFM) support.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';

export interface ChatMarkdownProps {
  /** The markdown content to render */
  content: string;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Custom components for markdown rendering in chat context.
 * Optimized for compact display within chat bubbles.
 */
const chatComponents: Components = {
  // Compact paragraphs - no extra margin
  p: ({ children }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,

  // Code blocks with syntax highlighting
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-black/10 py-0.5 px-1.5 rounded font-mono text-[0.85em] text-accent" {...props}>
          {children}
        </code>
      );
    }
    // Block code with syntax highlighting
    return (
      <CodeBlock className={className}>
        {String(children).replace(/\n$/, '')}
      </CodeBlock>
    );
  },

  // Compact lists
  ul: ({ children }) => <ul className="my-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 pl-6">{children}</ol>,
  li: ({ children }) => <li className="my-1">{children}</li>,

  // Headings - scaled down for chat
  h1: ({ children }) => <h4 className="my-2 mb-1 font-semibold leading-tight text-[1.1em]">{children}</h4>,
  h2: ({ children }) => <h5 className="my-2 mb-1 font-semibold leading-tight text-[1.05em]">{children}</h5>,
  h3: ({ children }) => <h6 className="my-2 mb-1 font-semibold leading-tight text-[1em]">{children}</h6>,
  h4: ({ children }) => <h6 className="my-2 mb-1 font-semibold leading-tight text-[1em]">{children}</h6>,
  h5: ({ children }) => <h6 className="my-2 mb-1 font-semibold leading-tight text-[1em]">{children}</h6>,
  h6: ({ children }) => <h6 className="my-2 mb-1 font-semibold leading-tight text-[1em]">{children}</h6>,

  // Links - open in new tab
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent no-underline border-b border-dotted border-current hover:underline">
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="my-2 py-2 px-3 border-l-[3px] border-border bg-black/10 rounded-r italic text-text-muted">{children}</blockquote>
  ),

  // Tables (GFM)
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded">
      <table className="w-full border-collapse text-[0.85em]">{children}</table>
    </div>
  ),

  // Horizontal rule
  hr: () => <hr className="my-3 border-none border-t border-border" />,

  // Strong/emphasis
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
}

/**
 * Renders markdown content optimized for chat bubbles.
 * Supports GitHub Flavored Markdown including tables, task lists, and strikethrough.
 */
export function ChatMarkdown({ content, className }: ChatMarkdownProps): React.ReactElement {
  return (
    <div className={`text-[0.9rem] leading-relaxed break-words ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
