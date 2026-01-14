/**
 * ChatMarkdown - Lightweight markdown renderer for chat bubbles.
 * Uses react-markdown with GitHub Flavored Markdown (GFM) support.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import './ChatMarkdown.css';

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
  p: ({ children }) => <p className="chat-md-p">{children}</p>,

  // Code blocks with syntax highlighting placeholder
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="chat-md-inline-code" {...props}>
          {children}
        </code>
      );
    }
    // Block code
    const language = className?.replace('language-', '') || '';
    return (
      <div className="chat-md-code-block">
        {language && <span className="chat-md-code-lang">{language}</span>}
        <pre>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },

  // Compact lists
  ul: ({ children }) => <ul className="chat-md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="chat-md-ol">{children}</ol>,
  li: ({ children }) => <li className="chat-md-li">{children}</li>,

  // Headings - scaled down for chat
  h1: ({ children }) => <h4 className="chat-md-h1">{children}</h4>,
  h2: ({ children }) => <h5 className="chat-md-h2">{children}</h5>,
  h3: ({ children }) => <h6 className="chat-md-h3">{children}</h6>,
  h4: ({ children }) => <h6 className="chat-md-h4">{children}</h6>,
  h5: ({ children }) => <h6 className="chat-md-h5">{children}</h6>,
  h6: ({ children }) => <h6 className="chat-md-h6">{children}</h6>,

  // Links - open in new tab
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="chat-md-link">
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="chat-md-blockquote">{children}</blockquote>
  ),

  // Tables (GFM)
  table: ({ children }) => (
    <div className="chat-md-table-wrapper">
      <table className="chat-md-table">{children}</table>
    </div>
  ),

  // Horizontal rule
  hr: () => <hr className="chat-md-hr" />,

  // Strong/emphasis
  strong: ({ children }) => <strong className="chat-md-strong">{children}</strong>,
  em: ({ children }) => <em className="chat-md-em">{children}</em>,
};

/**
 * Renders markdown content optimized for chat bubbles.
 * Supports GitHub Flavored Markdown including tables, task lists, and strikethrough.
 */
export function ChatMarkdown({ content, className }: ChatMarkdownProps): React.ReactElement {
  return (
    <div className={`chat-markdown ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
