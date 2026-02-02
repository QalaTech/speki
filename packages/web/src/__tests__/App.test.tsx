import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@test/render';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('App - Settings Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockProjects = [
    { name: 'Test Project', path: '/test/path', status: 'active', lastActivity: '2024-01-01' },
  ];

  const mockTasks = {
    projectName: 'Test Project',
    branchName: 'main',
    userStories: [],
  };

  const mockRalphStatus = {
    status: 'stopped',
    currentIteration: 0,
    maxIterations: 0,
    currentStory: null,
  };

  const mockDecomposeState = {
    status: 'IDLE',
    message: '',
  };

  const mockSettings = {
    decompose: {
      reviewer: {
        agent: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        reasoningEffort: 'medium'
      }
    },
    condenser: {
      agent: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      reasoningEffort: 'medium'
    },
    specGenerator: {
      agent: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      reasoningEffort: 'medium'
    },
    taskRunner: {
      agent: 'auto',
      model: 'claude-3-5-sonnet-20241022',
      reasoningEffort: 'medium'
    },
    specChat: {
      agent: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      reasoningEffort: 'medium'
    },
    execution: {
      keepAwake: false
    }
  };

  const setupMocks = () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/projects')) {
        return new Response(JSON.stringify(mockProjects));
      }
      if (url.includes('/api/ralph/status')) {
        return new Response(JSON.stringify(mockRalphStatus));
      }
      if (url.includes('/api/tasks')) {
        return new Response(JSON.stringify(mockTasks));
      }
      if (url.includes('/api/decompose/state')) {
        return new Response(JSON.stringify(mockDecomposeState));
      }
      if (url.includes('/api/ralph/progress')) {
        return new Response('');
      }
      if (url.includes('/api/settings/cli/detect')) {
        return new Response(JSON.stringify({
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: true, version: '2.1.2', command: 'claude' },
        }));
      }
      if (url.includes('/api/settings')) {
        return new Response(JSON.stringify(mockSettings));
      }
      return new Response(JSON.stringify({}));
    });
  };

  const renderApp = (initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    );
  };

  describe('SettingsNavItem_ShouldAppearInTopNav', () => {
    it('should render Settings button in TopNav', async () => {
      // Arrange
      setupMocks();

      // Act - TopNav only shows on non-home routes
      renderApp('/execution/kanban');

      // Assert
      await waitFor(() => {
        const settingsButton = screen.getByTitle('Settings');
        expect(settingsButton).toBeInTheDocument();
      });
    });

    it('should display gear icon for Settings', async () => {
      // Arrange
      setupMocks();

      // Act - TopNav only shows on non-home routes
      renderApp('/execution/kanban');

      // Assert
      await waitFor(() => {
        const settingsButton = screen.getByTitle('Settings');
        expect(settingsButton).toBeInTheDocument();

        // Check for gear icon (svg inside button)
        const svgIcon = settingsButton.querySelector('svg');
        expect(svgIcon).toBeInTheDocument();
      });
    });
  });

  describe('SettingsNavItem_OnClick_ShouldNavigateToSettings', () => {
    it('should show SettingsView when Settings button is clicked', async () => {
      // Arrange
      setupMocks();

      // Act - TopNav only shows on non-home routes
      renderApp('/execution/kanban');

      await waitFor(() => {
        const settingsButton = screen.getByTitle('Settings');
        expect(settingsButton).toBeInTheDocument();
      });

      const settingsButton = screen.getByTitle('Settings');
      fireEvent.click(settingsButton);

      // Assert - SettingsView should be rendered (it shows "Settings" heading and "Decompose Reviewer" section)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
      });

      expect(screen.getByText('Decompose Reviewer')).toBeInTheDocument();
    });
  });

  describe('SettingsNavItem_WhenActive_ShouldShowActiveStyle', () => {
    it('should have active styling when on settings page', async () => {
      // Arrange
      setupMocks();

      // Act - render directly on settings page
      renderApp('/settings');

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const settingsButton = screen.getByTitle('Settings');

      // Settings button should have active styling (ShadCN uses bg-muted/80 class)
      await waitFor(() => {
        expect(settingsButton.className).toContain('bg-muted/80');
      });
    });

    it('should not have active styling when navigating away from settings', async () => {
      // Arrange
      setupMocks();

      // Act - start on settings page
      renderApp('/settings');

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const settingsButton = screen.getByTitle('Settings');
      const executionButton = screen.getAllByText('Execution')[0];

      // Click to navigate to execution
      fireEvent.click(executionButton);

      // Assert - settings should no longer have active styling
      await waitFor(() => {
        expect(settingsButton.className).not.toContain('bg-muted/80');
      });
    });
  });

  describe('SettingsRoute_ShouldRenderSettingsView', () => {
    it('should render SettingsView when navigating directly to /settings', async () => {
      // Arrange
      setupMocks();

      // Act - render with /settings as initial route
      renderApp('/settings');

      // Assert - SettingsView should be rendered immediately (after loading)
      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
      });

      expect(screen.getByText('Decompose Reviewer')).toBeInTheDocument();

      // Settings button should have active styling
      const settingsButton = screen.getByTitle('Settings');
      expect(settingsButton.className).toContain('bg-muted/80');
    });
  });

  describe('SettingsRoute_DirectNavigation_ShouldWork', () => {
    it('should show specs page when URL is /spec-review', async () => {
      // Arrange
      setupMocks();

      // Act - render with /spec-review as initial route
      renderApp('/spec-review');

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      // Assert - Specs button should have active styling (ShadCN uses bg-background)
      const specsButton = screen.getAllByText('Specs')[0];
      expect(specsButton.closest('button')?.className).toContain('bg-background');

      // Settings button should NOT have active styling
      const settingsButton = screen.getByTitle('Settings');
      expect(settingsButton.className).not.toContain('bg-muted/80');
    });

    it('should render home page when URL is /', async () => {
      // Arrange
      setupMocks();

      // Act - render with / as initial route (home page has its own layout, no TopNav)
      renderApp('/');

      // Assert - Home page should render (TopNav is not shown on home page)
      await waitFor(() => {
        expect(screen.getByText('SPEKI')).toBeInTheDocument();
      });
    });
  });

  describe('topNav_ShowsSpecsItem', () => {
    it('should render Specs button in TopNav', async () => {
      // Arrange
      setupMocks();

      // Act - TopNav only shows on non-home routes
      renderApp('/execution/kanban');

      // Assert
      await waitFor(() => {
        const specsButton = screen.getAllByText('Specs')[0];
        expect(specsButton).toBeInTheDocument();
      });
    });

    it('should display document icon with Specs label', async () => {
      // Arrange
      setupMocks();

      // Act - TopNav only shows on non-home routes
      renderApp('/execution/kanban');

      // Assert
      await waitFor(() => {
        const specsButton = screen.getAllByText('Specs')[0];
        expect(specsButton).toBeInTheDocument();
        // Check for document icon (svg inside button)
        const svgIcon = specsButton.closest('button')?.querySelector('svg');
        expect(svgIcon).toBeInTheDocument();
      });
    });
  });

  describe('topNav_ClickNavigates', () => {
    it('should navigate to /spec-review when Specs button is clicked', async () => {
      // Arrange
      setupMocks();

      // Act - TopNav only shows on non-home routes
      renderApp('/execution/kanban');

      await waitFor(() => {
        const specsButton = screen.getAllByText('Specs')[0];
        expect(specsButton).toBeInTheDocument();
      });

      const specsButton = screen.getAllByText('Specs')[0];
      fireEvent.click(specsButton);

      // Assert - Specs button should now have active styling
      await waitFor(() => {
        expect(specsButton.closest('button')?.className).toContain('bg-background');
      });
    });

    it('should have active styling when on spec-review page', async () => {
      // Arrange
      setupMocks();

      // Act - render directly on spec-review page
      renderApp('/spec-review');

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const specsButton = screen.getAllByText('Specs')[0];

      // Should have active styling
      await waitFor(() => {
        expect(specsButton.closest('button')?.className).toContain('bg-background');
      });
    });
  });
});
