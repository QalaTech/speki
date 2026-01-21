import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './CodeBlock.css';

interface CodeBlockProps {
  language?: string;
  children: string;
  className?: string;
}

export function CodeBlock({ language, children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lang = language || className?.replace('language-', '') || 'text';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(String(children));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container">
      {lang && lang !== 'text' && (
        <div className="code-block-header">
          <span className="code-block-lang">{lang}</span>
          <button
            className="code-block-copy"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      )}
      <SyntaxHighlighter
        language={lang}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: lang !== 'text' ? '0 0 6px 6px' : '6px',
          fontSize: '0.85em',
        }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
}
