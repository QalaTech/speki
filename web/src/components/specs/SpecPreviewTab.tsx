import { useEffect, useState, useMemo } from 'react';
import './SpecPreviewTab.css';

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
    return `<pre class="preview-code-block" data-lang="${lang}"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="preview-inline-code">$1</code>');

  // Headers with IDs for TOC
  html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, text) => {
    const level = hashes.length;
    const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `<h${level} id="${id}" class="preview-heading preview-h${level}">${text}</h${level}>`;
  });

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="preview-link" target="_blank" rel="noopener">$1</a>');

  // Unordered lists
  html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li class="preview-list-item">$1</li>');
  html = html.replace(/(<li class="preview-list-item">.*<\/li>\n?)+/g, '<ul class="preview-list">$&</ul>');

  // Ordered lists
  html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="preview-list-item preview-list-item--ordered">$1</li>');

  // Checkboxes
  html = html.replace(/\[ \]/g, '<input type="checkbox" disabled class="preview-checkbox">');
  html = html.replace(/\[x\]/gi, '<input type="checkbox" disabled checked class="preview-checkbox">');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="preview-blockquote">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr class="preview-hr">');

  // Paragraphs - wrap loose text
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p class="preview-paragraph">$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p class="preview-paragraph"><\/p>/g, '');

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

    const headings = document.querySelectorAll('.preview-heading');
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

  // For non-markdown files, show raw content
  if (!isMarkdown) {
    return (
      <div className="spec-preview-tab spec-preview-tab--raw">
        <div className="spec-preview-content">
          <pre className="preview-raw-content">
            <code>{content}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="spec-preview-tab">
      {toc.length > 2 && (
        <aside className="spec-preview-toc">
          <div className="spec-preview-toc-title">On this page</div>
          <nav className="spec-preview-toc-nav">
            {toc.map((item) => (
              <button
                key={item.id}
                className={`spec-preview-toc-item spec-preview-toc-item--level-${item.level} ${
                  activeHeading === item.id ? 'spec-preview-toc-item--active' : ''
                }`}
                onClick={() => scrollToHeading(item.id)}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </aside>
      )}

      <div className="spec-preview-content">
        <article
          className="spec-preview-article"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
