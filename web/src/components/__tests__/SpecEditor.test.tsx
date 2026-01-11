import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { SpecEditor, type SpecEditorRef } from '../SpecEditor';

vi.mock('@mdxeditor/editor', () => {
  const React = require('react');

  const mockMethods = {
    getMarkdown: vi.fn(() => '# Test Content'),
    setMarkdown: vi.fn(),
    focus: vi.fn(),
    insertMarkdown: vi.fn(),
    getContentEditableHTML: vi.fn(() => '<h1>Test Content</h1>'),
    getSelectionMarkdown: vi.fn(() => ''),
  };

  const MDXEditor = React.forwardRef(function MDXEditor(
    props: {
      markdown: string;
      onChange?: (markdown: string) => void;
      plugins?: unknown[];
      placeholder?: string;
      autoFocus?: boolean;
      contentEditableClassName?: string;
    },
    ref: React.ForwardedRef<typeof mockMethods>
  ) {
    React.useImperativeHandle(ref, () => mockMethods);

    return (
      <div data-testid="mdx-editor" data-markdown={props.markdown}>
        <textarea
          data-testid="mdx-editor-textarea"
          defaultValue={props.markdown}
          onChange={(e) => props.onChange?.(e.target.value)}
          placeholder={props.placeholder}
        />
        {props.plugins && (
          <span data-testid="plugins-count">{props.plugins.length}</span>
        )}
      </div>
    );
  });

  return {
    MDXEditor,
    diffSourcePlugin: vi.fn((options) => ({
      pluginId: 'diff-source',
      viewMode: options?.viewMode ?? 'rich-text',
    })),
    headingsPlugin: vi.fn(() => ({ pluginId: 'headings' })),
    listsPlugin: vi.fn(() => ({ pluginId: 'lists' })),
    quotePlugin: vi.fn(() => ({ pluginId: 'quote' })),
    codeBlockPlugin: vi.fn(() => ({ pluginId: 'code-block' })),
    tablePlugin: vi.fn(() => ({ pluginId: 'table' })),
    markdownShortcutPlugin: vi.fn(() => ({ pluginId: 'markdown-shortcut' })),
  };
});

vi.mock('../lib/mdx-editor/config', () => ({
  createEditorPlugins: vi.fn(() => [
    { pluginId: 'headings' },
    { pluginId: 'lists' },
    { pluginId: 'quote' },
    { pluginId: 'code-block' },
    { pluginId: 'table' },
    { pluginId: 'markdown-shortcut' },
    { pluginId: 'diff-source' },
  ]),
  editorPlugins: [],
}));

describe('SpecEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('SpecEditor_RendersMDXEditor', () => {
    it('should render MDXEditor component with plugins', () => {
      render(<SpecEditor content="# Hello World" />);

      expect(screen.getByTestId('spec-editor')).toBeInTheDocument();
      expect(screen.getByTestId('mdx-editor')).toBeInTheDocument();
      expect(screen.getByTestId('plugins-count')).toBeInTheDocument();
    });

    it('should pass plugins to MDXEditor', () => {
      render(<SpecEditor content="# Test" />);

      const pluginsCount = screen.getByTestId('plugins-count');
      expect(parseInt(pluginsCount.textContent || '0')).toBeGreaterThan(0);
    });

    it('should apply custom className to container', () => {
      render(<SpecEditor content="# Test" className="custom-class" />);

      const container = screen.getByTestId('spec-editor');
      expect(container.className).toContain('custom-class');
    });
  });

  describe('SpecEditor_DisplaysContent', () => {
    it('should display provided markdown content', () => {
      const content = '# Test Heading\n\nSome paragraph text.';
      render(<SpecEditor content={content} />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveAttribute('data-markdown', content);
    });

    it('should display placeholder when provided', () => {
      render(<SpecEditor content="" placeholder="Enter spec content..." />);

      const textarea = screen.getByTestId('mdx-editor-textarea');
      expect(textarea).toHaveAttribute('placeholder', 'Enter spec content...');
    });
  });

  describe('SpecEditor_ExposesRef', () => {
    it('should expose ref with getMarkdown method', () => {
      const ref = createRef<SpecEditorRef>();
      render(<SpecEditor content="# Initial" ref={ref} />);

      expect(ref.current).not.toBeNull();
      expect(typeof ref.current?.getMarkdown).toBe('function');

      const result = ref.current?.getMarkdown();
      expect(result).toBe('# Test Content');
    });

    it('should expose ref with setMarkdown method', () => {
      const ref = createRef<SpecEditorRef>();
      render(<SpecEditor content="# Initial" ref={ref} />);

      expect(typeof ref.current?.setMarkdown).toBe('function');

      act(() => {
        ref.current?.setMarkdown('# New Content');
      });
    });

    it('should expose ref with focus method', () => {
      const ref = createRef<SpecEditorRef>();
      render(<SpecEditor content="# Initial" ref={ref} />);

      expect(typeof ref.current?.focus).toBe('function');

      act(() => {
        ref.current?.focus();
      });
    });

    it('should expose ref with insertMarkdown method', () => {
      const ref = createRef<SpecEditorRef>();
      render(<SpecEditor content="# Initial" ref={ref} />);

      expect(typeof ref.current?.insertMarkdown).toBe('function');

      act(() => {
        ref.current?.insertMarkdown('**bold text**');
      });
    });

    it('should expose getEditorMethods for advanced access', () => {
      const ref = createRef<SpecEditorRef>();
      render(<SpecEditor content="# Initial" ref={ref} />);

      expect(typeof ref.current?.getEditorMethods).toBe('function');

      const methods = ref.current?.getEditorMethods();
      expect(methods).not.toBeNull();
    });
  });

  describe('SpecEditor_SyncsOnChange', () => {
    it('should call onChange when content changes', () => {
      const handleChange = vi.fn();
      render(<SpecEditor content="# Initial" onChange={handleChange} />);

      const textarea = screen.getByTestId('mdx-editor-textarea');

      fireEvent.change(textarea, { target: { value: '# Changed' } });

      expect(handleChange).toHaveBeenCalledWith('# Changed');
    });

    it('should not throw when onChange is not provided', () => {
      expect(() => {
        render(<SpecEditor content="# Initial" />);
      }).not.toThrow();
    });

    it('should pass markdown content to onChange handler', () => {
      const handleChange = vi.fn();
      render(<SpecEditor content="# Initial" onChange={handleChange} />);

      const textarea = screen.getByTestId('mdx-editor-textarea');

      fireEvent.change(textarea, { target: { value: '# Updated Content' } });

      expect(handleChange).toHaveBeenCalledWith('# Updated Content');
    });
  });

  describe('SpecEditor_ViewModes', () => {
    it('should default to rich-text view mode', () => {
      render(<SpecEditor content="# Test" />);

      expect(screen.getByTestId('spec-editor')).toBeInTheDocument();
    });

    it('should support source view mode', () => {
      render(<SpecEditor content="# Test" viewMode="source" />);

      expect(screen.getByTestId('spec-editor')).toBeInTheDocument();
    });
  });
});
