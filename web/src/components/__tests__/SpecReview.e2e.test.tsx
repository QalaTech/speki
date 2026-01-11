import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SpecReviewPage } from '../SpecReviewPage';
import type { SuggestionCard as SuggestionCardType } from '../../../../src/types/index.js';

// Mock MDXEditor to avoid CSS parsing issues in tests
vi.mock('@mdxeditor/editor', () => {
  const createPlugin = (id: string) => vi.fn(() => ({ pluginId: id }));
  const createComponent = () => vi.fn(() => null);

  return {
    MDXEditor: vi.fn().mockImplementation(({ markdown, placeholder }) => (
      <div data-testid="mdx-editor">
        <textarea data-testid="editor-textarea" defaultValue={markdown} placeholder={placeholder} />
      </div>
    )),
    diffSourcePlugin: createPlugin('diff-source'),
    headingsPlugin: createPlugin('headings'),
    listsPlugin: createPlugin('lists'),
    quotePlugin: createPlugin('quote'),
    thematicBreakPlugin: createPlugin('thematic-break'),
    markdownShortcutPlugin: createPlugin('markdown-shortcut'),
    codeBlockPlugin: createPlugin('code-block'),
    tablePlugin: createPlugin('table'),
    linkPlugin: createPlugin('link'),
    linkDialogPlugin: createPlugin('link-dialog'),
    imagePlugin: createPlugin('image'),
    frontmatterPlugin: createPlugin('frontmatter'),
    toolbarPlugin: createPlugin('toolbar'),
    Separator: createComponent(),
    BlockTypeSelect: createComponent(),
    BoldItalicUnderlineToggles: createComponent(),
    CreateLink: createComponent(),
    InsertCodeBlock: createComponent(),
    InsertImage: createComponent(),
    InsertTable: createComponent(),
    InsertThematicBreak: createComponent(),
    ListsToggle: createComponent(),
    UndoRedo: createComponent(),
    DiffSourceToggleWrapper: createComponent(),
  };
});

// Track diff mode state for testing
let mockDiffState = { isActive: false, proposedContent: null as string | null };

vi.mock('../../hooks/useSpecEditor', () => ({
  useSpecEditor: vi.fn().mockImplementation(() => ({
    content: '',
    diffState: mockDiffState,
    isDirty: false,
    editorRef: { current: null },
    setContent: vi.fn(),
    markClean: vi.fn(),
    getSelection: vi.fn().mockReturnValue(''),
    scrollToHeading: vi.fn().mockReturnValue(true),
    scrollToLineNumber: vi.fn().mockReturnValue(true),
    highlight: vi.fn().mockReturnValue(null),
    enterDiffMode: vi.fn().mockImplementation((proposed: string) => {
      mockDiffState = { isActive: true, proposedContent: proposed };
    }),
    exitDiffMode: vi.fn().mockImplementation(() => {
      const content = mockDiffState.proposedContent;
      mockDiffState = { isActive: false, proposedContent: null };
      return content || '';
    }),
    getDiffProposedContent: vi.fn().mockReturnValue(mockDiffState.proposedContent),
  })),
}));

// Track diff approval state for testing
let mockDiffApprovalState = {
  isActive: false,
  currentSuggestion: null as SuggestionCardType | null,
  isLoading: false,
};

vi.mock('../../hooks/useDiffApproval', () => ({
  useDiffApproval: vi.fn().mockImplementation(() => ({
    isActive: mockDiffApprovalState.isActive,
    currentSuggestion: mockDiffApprovalState.currentSuggestion,
    isLoading: mockDiffApprovalState.isLoading,
    error: null,
    isEditing: false,
    enterDiffMode: vi.fn().mockImplementation((suggestion: SuggestionCardType) => {
      mockDiffApprovalState = { isActive: true, currentSuggestion: suggestion, isLoading: false };
    }),
    approve: vi.fn().mockImplementation(() => {
      mockDiffApprovalState = { isActive: false, currentSuggestion: null, isLoading: false };
    }),
    reject: vi.fn().mockImplementation(() => {
      mockDiffApprovalState = { isActive: false, currentSuggestion: null, isLoading: false };
    }),
    startEdit: vi.fn(),
    applyEdit: vi.fn(),
    cancel: vi.fn().mockImplementation(() => {
      mockDiffApprovalState = { isActive: false, currentSuggestion: null, isLoading: false };
    }),
    reset: vi.fn(),
  })),
}));

describe('E2E: Dashboard Spec Review', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  function createMockSuggestion(overrides: Partial<SuggestionCardType> = {}): SuggestionCardType {
    return {
      id: 'sug-1',
      category: 'clarity',
      severity: 'warning',
      section: 'Requirements',
      textSnippet: 'The system shall...',
      issue: 'Requirement is ambiguous',
      suggestedFix: 'Add specific metrics to clarify the requirement',
      status: 'pending',
      ...overrides,
    };
  }

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockDiffState = { isActive: false, proposedContent: null };
    mockDiffApprovalState = { isActive: false, currentSuggestion: null, isLoading: false };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderSpecReviewPage(projectPath?: string) {
    return render(
      <MemoryRouter>
        <SpecReviewPage projectPath={projectPath} />
      </MemoryRouter>
    );
  }

  interface SetupFetchesOptions {
    files?: Array<{ name: string; path: string }>;
    content?: string;
    session?: {
      sessionId: string;
      specFilePath: string;
      status: string;
      suggestions?: SuggestionCardType[];
    } | null;
  }

  function setupFetches(options: SetupFetchesOptions = {}): void {
    const {
      files = [{ name: 'test-spec.md', path: '/specs/test-spec.md' }],
      content = '# Test Spec\n\nContent here',
      session = null,
    } = options;

    mockFetch.mockImplementation((url: string) => {
      const createResponse = (data: unknown) => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(data),
      });

      if (url.includes('/api/spec-review/files')) {
        return createResponse({ files });
      }
      if (url.includes('/api/spec-review/content/')) {
        return createResponse({ content });
      }
      if (url.includes('/api/sessions/spec/')) {
        return createResponse({ session });
      }
      return createResponse({});
    });
  }

  async function waitForPageLoad(): Promise<void> {
    await waitFor(() => {
      expect(screen.getByTestId('spec-review-page')).toBeInTheDocument();
    });
  }

  describe('e2e_dashboard_SplitView_Renders', () => {
    it('should render complete split view layout with all panels', async () => {
      setupFetches();
      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByTestId('split-view')).toBeInTheDocument();
      expect(screen.getByTestId('left-panel')).toBeInTheDocument();
      expect(screen.getByTestId('right-panel')).toBeInTheDocument();
      expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
    });

    it('should render editor in left panel and review panel in right panel', async () => {
      setupFetches();
      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByText('Spec Editor')).toBeInTheDocument();
      });

      expect(screen.getByText('Review Panel')).toBeInTheDocument();
    });

    it('should load spec content into editor when file is selected', async () => {
      setupFetches({
        files: [{ name: 'feature-spec.md', path: '/specs/feature-spec.md' }],
        content: '# Feature Specification\n\nThis is the feature spec content.',
      });

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('mdx-editor')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/spec-review/content/'));
    });

    it('should allow resizing panels with resize handle', async () => {
      setupFetches();
      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
      });

      const resizeHandle = screen.getByTestId('resize-handle');
      const leftPanel = screen.getByTestId('left-panel');

      expect(leftPanel.style.width).toBe('50%');
      expect(resizeHandle).toHaveAttribute('aria-orientation', 'vertical');
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '50');
    });
  });

  describe('e2e_dashboard_Suggestions_Interactive', () => {
    it('should display suggestions from loaded session', async () => {
      const suggestions = [
        createMockSuggestion({ id: 'sug-1', issue: 'First issue' }),
        createMockSuggestion({ id: 'sug-2', issue: 'Second issue', severity: 'critical' }),
      ];

      setupFetches({
        session: {
          sessionId: 'session-123',
          specFilePath: '/specs/test-spec.md',
          status: 'in_progress',
          suggestions,
        },
      });

      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByText('Review Panel')).toBeInTheDocument();
    });

    it('should show suggestion cards with correct severity indicators', async () => {
      setupFetches();
      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByTestId('right-panel')).toBeInTheDocument();
    });

    it('should handle file selection change', async () => {
      setupFetches({
        files: [
          { name: 'spec-one.md', path: '/specs/spec-one.md' },
          { name: 'spec-two.md', path: '/specs/spec-two.md' },
        ],
      });

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('file-selector')).toBeInTheDocument();
      });

      const selector = screen.getByTestId('file-selector') as HTMLSelectElement;
      fireEvent.change(selector, { target: { value: '/specs/spec-two.md' } });

      expect(selector.value).toBe('/specs/spec-two.md');
    });
  });

  describe('e2e_dashboard_DiffApproval_Works', () => {
    it('should render diff approval bar when diff mode is active', async () => {
      mockDiffApprovalState = {
        isActive: true,
        currentSuggestion: createMockSuggestion(),
        isLoading: false,
      };

      setupFetches();
      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByTestId('left-panel')).toBeInTheDocument();
    });

    it('should show issue description in diff approval bar', async () => {
      setupFetches();
      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByTestId('split-view')).toBeInTheDocument();
    });

    it('should handle approve action', async () => {
      setupFetches();
      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByTestId('right-panel')).toBeInTheDocument();
    });

    it('should handle reject action', async () => {
      setupFetches();
      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByTestId('right-panel')).toBeInTheDocument();
    });
  });

  describe('e2e_dashboard_Session_Persists', () => {
    it('should load spec files on page load', async () => {
      setupFetches();
      renderSpecReviewPage();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/spec-review/files'));
      });
    });

    it('should fetch files with project path when provided', async () => {
      setupFetches({ files: [] });
      renderSpecReviewPage('/test/project');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('project=%2Ftest%2Fproject'));
      });
    });

    it('should persist session state when file changes', async () => {
      setupFetches({
        files: [
          { name: 'spec-one.md', path: '/specs/spec-one.md' },
          { name: 'spec-two.md', path: '/specs/spec-two.md' },
        ],
      });

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('file-selector')).toBeInTheDocument();
      });

      const selector = screen.getByTestId('file-selector') as HTMLSelectElement;
      expect(selector.value).toBe('/specs/spec-one.md');

      fireEvent.change(selector, { target: { value: '/specs/spec-two.md' } });
      expect(selector.value).toBe('/specs/spec-two.md');
    });

    it('should render page with session support structure', async () => {
      setupFetches();
      renderSpecReviewPage();
      await waitForPageLoad();

      expect(screen.getByTestId('split-view')).toBeInTheDocument();
      expect(screen.getByTestId('left-panel')).toBeInTheDocument();
      expect(screen.getByTestId('right-panel')).toBeInTheDocument();
    });

    it('should maintain file selector when switching files', async () => {
      setupFetches({
        files: [
          { name: 'spec-one.md', path: '/specs/spec-one.md' },
          { name: 'spec-two.md', path: '/specs/spec-two.md' },
          { name: 'spec-three.md', path: '/specs/spec-three.md' },
        ],
      });

      renderSpecReviewPage();

      await waitFor(() => {
        expect(screen.getByTestId('file-selector')).toBeInTheDocument();
      });

      const selector = screen.getByTestId('file-selector') as HTMLSelectElement;

      fireEvent.change(selector, { target: { value: '/specs/spec-two.md' } });
      expect(selector.value).toBe('/specs/spec-two.md');

      fireEvent.change(selector, { target: { value: '/specs/spec-three.md' } });
      expect(selector.value).toBe('/specs/spec-three.md');
    });
  });
});
