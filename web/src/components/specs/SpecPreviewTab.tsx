import { useEffect, useState, useMemo } from 'react';

interface SpecPreviewTabProps {
  content: string;
  filePath: string;
}

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

// Simple markdown to HTML converter for preview
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML entities
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (fenced) - must be before other processing
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="my-4 py-4 px-5 bg-[#1e1e1e] border border-border rounded-lg overflow-x-auto font-mono text-[13px] leading-relaxed text-[#d4d4d4]" data-lang="${lang}"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="py-0.5 px-1.5 bg-surface-hover rounded font-mono text-[0.9em] text-[#e06c75]">$1</code>');

  // Headers with IDs for TOC
  html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, text) => {
    const level = hashes.length;
    const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const sizeClass = level === 1 ? 'text-[28px] pb-3 border-b border-border' :
                      level === 2 ? 'text-[22px] pb-2 border-b border-border' :
                      level === 3 ? 'text-[18px]' :
                      level === 4 ? 'text-[16px]' :
                      level === 5 ? 'text-[14px]' : 'text-[13px] text-text-muted';
    return `<h${level} id="${id}" class="mt-8 first:mt-0 mb-4 font-semibold leading-tight text-text scroll-mt-5 ${sizeClass}">${text}</h${level}>`;
  });

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent no-underline hover:underline" target="_blank" rel="noopener">$1</a>');

  // Unordered lists
  html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li class="my-1">$1</li>');
  html = html.replace(/(<li class="my-1">.*<\/li>\n?)+/g, '<ul class="mb-4 pl-6">$&</ul>');

  // Ordered lists
  html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="my-1 list-decimal">$1</li>');

  // Checkboxes
  html = html.replace(/\[ \]/g, '<input type="checkbox" disabled class="mr-2 scale-110 accent-accent">');
  html = html.replace(/\[x\]/gi, '<input type="checkbox" disabled checked class="mr-2 scale-110 accent-accent">');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="my-4 py-3 px-5 border-l-4 border-border bg-surface text-text-muted rounded-r-md">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr class="my-6 border-none border-t border-border">');

  // Paragraphs - wrap loose text
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p class="mb-4">$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p class="mb-4"><\/p>/g, '');

  return html;
}

// Extract TOC items from markdown
function extractTOC(markdown: string): TOCItem[] {
  const items: TOCItem[] = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2];
    const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    items.push({ id, text, level });
  }

  return items;
}

export function SpecPreviewTab({ content, filePath }: SpecPreviewTabProps) {
  const [activeHeading, setActiveHeading] = useState<string | null>(null);

  const html = useMemo(() => parseMarkdown(content), [content]);
  const toc = useMemo(() => extractTOC(content), [content]);

  // Track active heading on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveHeading(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    const headings = document.querySelectorAll('[class*="mt-8"][class*="font-semibold"]');
    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, [html]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const fileExt = filePath.split('.').pop()?.toLowerCase();
  const isMarkdown = ['md', 'mdx', 'markdown'].includes(fileExt || '');

  const getLevelClass = (level: number) => {
    const base = "block py-1.5 px-2 bg-transparent border-none border-l-2 border-transparent text-text-muted text-xs text-left cursor-pointer transition-all duration-150 whitespace-nowrap overflow-hidden text-ellipsis hover:text-text hover:bg-surface-hover";
    const indents = ['pl-2 font-medium', 'pl-4', 'pl-6 text-[11px]', 'pl-8 text-[11px]', 'pl-10 text-[11px]', 'pl-12 text-[11px]'];
    return `${base} ${indents[level - 1] || indents[0]}`;
  };

  // For non-markdown files, show raw content
  if (!isMarkdown) {
    return (
      <div className="flex h-full bg-bg overflow-hidden">
        <div className="flex-1 overflow-y-auto py-8 px-10">
          <pre className="bg-surface p-5 rounded-lg overflow-x-auto text-[13px] leading-relaxed text-text">
            <code>{content}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-bg overflow-hidden">
      {toc.length > 2 && (
        <aside className="shrink-0 w-[200px] py-5 px-4 border-r border-border bg-surface overflow-y-auto">
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em] mb-3">On this page</div>
          <nav className="flex flex-col gap-0.5">
            {toc.map((item) => (
              <button
                key={item.id}
                className={`${getLevelClass(item.level)} ${activeHeading === item.id ? 'text-accent border-l-accent' : ''}`}
                onClick={() => scrollToHeading(item.id)}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </aside>
      )}

      <div className="flex-1 overflow-y-auto py-8 px-10">
        <article
          className="max-w-[800px] mx-auto text-text text-[15px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
