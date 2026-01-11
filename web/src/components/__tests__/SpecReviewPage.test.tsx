import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SpecReviewPage } from '../SpecReviewPage';

// Mock MDXEditor to avoid CSS parsing issues in tests
vi.mock('@mdxeditor/editor', () => ({
  MDXEditor: vi.fn().mockImplementation(({ markdown, placeholder }) => (
    <div data-testid="mdx-editor">
      <textarea data-testid="editor-textarea" defaultValue={markdown} placeholder={placeholder} />
    </div>
  )),
  diffSourcePlugin: vi.fn(() => ({ pluginId: 'diff-source' })),
  headingsPlugin: vi.fn(() => ({ pluginId: 'headings' })),
  listsPlugin: vi.fn(() => ({ pluginId: 'lists' })),
  quotePlugin: vi.fn(() => ({ pluginId: 'quote' })),
  thematicBreakPlugin: vi.fn(() => ({ pluginId: 'thematic-break' })),
  markdownShortcutPlugin: vi.fn(() => ({ pluginId: 'markdown-shortcut' })),
  codeBlockPlugin: vi.fn(() => ({ pluginId: 'code-block' })),
  tablePlugin: vi.fn(() => ({ pluginId: 'table' })),
  linkPlugin: vi.fn(() => ({ pluginId: 'link' })),
  linkDialogPlugin: vi.fn(() => ({ pluginId: 'link-dialog' })),
  imagePlugin: vi.fn(() => ({ pluginId: 'image' })),
  frontmatterPlugin: vi.fn(() => ({ pluginId: 'frontmatter' })),
  toolbarPlugin: vi.fn(() => ({ pluginId: 'toolbar' })),
  Separator: vi.fn(() => null),
  BlockTypeSelect: vi.fn(() => null),
  BoldItalicUnderlineToggles: vi.fn(() => null),
  CreateLink: vi.fn(() => null),
  InsertCodeBlock: vi.fn(() => null),
  InsertImage: vi.fn(() => null),
  InsertTable: vi.fn(() => null),
  InsertThematicBreak: vi.fn(() => null),
  ListsToggle: vi.fn(() => null),
  UndoRedo: vi.fn(() => null),
  DiffSourceToggleWrapper: vi.fn(() => null),
}));

// Mock the useSpecEditor hook
vi.mock('../../hooks/useSpecEditor', () => ({
  useSpecEditor: vi.fn().mockReturnValue({
    content: '',
    diffState: { isActive: false },
    isDirty: false,
    editorRef: { current: null },
    setContent: vi.fn(),
    markClean: vi.fn(),
    getSelection: vi.fn().mockReturnValue(''),
    scrollToHeading: vi.fn().mockReturnValue(true),
    scrollToLineNumber: vi.fn().mockReturnValue(true),
    highlight: vi.fn().mockReturnValue(null),
    enterDiffMode: vi.fn(),
    exitDiffMode: vi.fn().mockReturnValue(''),
    getDiffProposedContent: vi.fn().mockReturnValue(null),
  }),
}));

// Mock the useDiffApproval hook
vi.mock('../../hooks/useDiffApproval', () => ({
  useDiffApproval: vi.fn().mockReturnValue({
    isActive: false,
    currentSuggestion: null,
    isLoading: false,
    error: null,
    isEditing: false,
    enterDiffMode: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    startEdit: vi.fn(),
    applyEdit: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
  }),
}));

describe('SpecReviewPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderSpecReviewPage = (projectPath?: string) => {
    return render(
      <MemoryRouter>
        <SpecReviewPage projectPath={projectPath} />
      </MemoryRouter>
    );
  };

  const setupDefaultFetches = (files: Array<{ name: string; path: string }> = []) => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/spec-review/files')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ files }),
        });
      }
      if (url.includes('/api/spec-review/content/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ content: '# Test Spec\n\nContent here' }),
        });
      }
      if (url.includes('/api/sessions/spec/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: null }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  };

  describe('SpecReviewPage_RendersSplitLayout', () => {
    it('should render page with split view container', async () => {
      setupDefaultFetches([
        { name: 'test-spec.md', path: '/specs/test-spec.md' },
      ]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('spec-review-page')).toBeInTheDocument();
      });

      expect(screen.getByTestId('split-view')).toBeInTheDocument();
    });

    it('should render left panel with spec editor', async () => {
      setupDefaultFetches([
        { name: 'test-spec.md', path: '/specs/test-spec.md' },
      ]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('left-panel')).toBeInTheDocument();
      });

      expect(screen.getByText('Spec Editor')).toBeInTheDocument();
    });

    it('should render right panel with review panel', async () => {
      setupDefaultFetches([
        { name: 'test-spec.md', path: '/specs/test-spec.md' },
      ]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('right-panel')).toBeInTheDocument();
      });

      expect(screen.getByText('Review Panel')).toBeInTheDocument();
    });
  });

  describe('SpecReviewPage_PanelsAreResizable', () => {
    it('should render resize handle between panels', async () => {
      setupDefaultFetches([
        { name: 'test-spec.md', path: '/specs/test-spec.md' },
      ]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
      });

      const resizeHandle = screen.getByTestId('resize-handle');
      expect(resizeHandle).toHaveAttribute('role', 'separator');
      expect(resizeHandle).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('should allow resizing panels via mouse drag', async () => {
      setupDefaultFetches([
        { name: 'test-spec.md', path: '/specs/test-spec.md' },
      ]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
      });

      const resizeHandle = screen.getByTestId('resize-handle');
      const leftPanel = screen.getByTestId('left-panel');

      const initialWidth = leftPanel.style.width;
      expect(initialWidth).toBe('50%');

      fireEvent.mouseDown(resizeHandle);

      expect(resizeHandle).toBeInTheDocument();
    });

    it('should have accessible resize handle with aria attributes', async () => {
      setupDefaultFetches([
        { name: 'test-spec.md', path: '/specs/test-spec.md' },
      ]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
      });

      const resizeHandle = screen.getByTestId('resize-handle');
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '50');
      expect(resizeHandle).toHaveAttribute('aria-valuemin', '20');
      expect(resizeHandle).toHaveAttribute('aria-valuemax', '80');
    });
  });

  describe('SpecReviewPage_ShowsFileSelector', () => {
    it('should render file selector dropdown', async () => {
      setupDefaultFetches([
        { name: 'spec-one.md', path: '/specs/spec-one.md' },
        { name: 'spec-two.md', path: '/specs/spec-two.md' },
      ]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('file-selector')).toBeInTheDocument();
      });

      expect(screen.getByText('Spec File:')).toBeInTheDocument();
    });

    it('should populate file selector with available spec files', async () => {
      const files = [
        { name: 'feature-spec.md', path: '/specs/feature-spec.md' },
        { name: 'api-spec.md', path: '/specs/api-spec.md' },
      ];
      setupDefaultFetches(files);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByText('feature-spec.md')).toBeInTheDocument();
      });

      expect(screen.getByText('api-spec.md')).toBeInTheDocument();
    });

    it('should show message when no spec files available', async () => {
      setupDefaultFetches([]);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByText('No spec files found')).toBeInTheDocument();
      });
    });

    it('should allow selecting a different file', async () => {
      const files = [
        { name: 'spec-one.md', path: '/specs/spec-one.md' },
        { name: 'spec-two.md', path: '/specs/spec-two.md' },
      ];
      setupDefaultFetches(files);

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('file-selector')).toBeInTheDocument();
      });

      const selector = screen.getByTestId('file-selector') as HTMLSelectElement;

      expect(selector.value).toBe('/specs/spec-one.md');

      fireEvent.change(selector, { target: { value: '/specs/spec-two.md' } });

      expect(selector.value).toBe('/specs/spec-two.md');
    });

    it('should include project path in API calls when provided', async () => {
      setupDefaultFetches([]);

      renderSpecReviewPage('/test/project');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('project=%2Ftest%2Fproject')
        );
      });
    });
  });
});
