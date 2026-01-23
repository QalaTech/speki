import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
    <div className="relative my-2 rounded-md overflow-hidden bg-[#1e1e1e]">
      {lang && lang !== 'text' && (
        <div className="py-1 px-2.5 bg-black/30 border-b border-white/10 flex justify-between items-center">
          <span className="text-[0.7em] text-[#888] uppercase tracking-wide">{lang}</span>
          <button
            className="bg-white/10 border border-white/20 rounded px-2.5 py-0.5 text-[#e0e0e0] text-[0.7em] cursor-pointer transition-all duration-200 hover:bg-white/15 hover:-translate-y-px active:translate-y-0"
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
