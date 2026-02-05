import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@test/render';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import App from '../App';

// Mock SSE hooks to avoid background updates and act issues
vi.mock('@features/projects', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useProjectsSSE: vi.fn(),
  };
});

vi.mock('@features/execution', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useExecutionSSE: vi.fn(),
  };
});

describe('App - Settings Navigation', () => {
  const mockProjects = [
    { name: 'test-project-1', path: '/test/path', status: 'active', lastActivity: '2024-01-01' },
  ];

  const mockTasks = {
    projectName: 'test-project-1',
    branchName: 'main',
    userStories: [],
  };

  const mockRalphStatus = {
    status: 'stopped',
    running: false,
    currentIteration: 0,
    maxIterations: 0,
    currentStory: null,
  };

  const mockDecomposeState = {
    status: 'IDLE',
    message: '',
  };

  const setupMocks = () => {
    server.use(
      http.get('/api/projects', () => {
        return HttpResponse.json(mockProjects);
      }),
      http.get('/api/ralph/status', () => {
        return HttpResponse.json(mockRalphStatus);
      }),
      http.get('/api/tasks', () => {
        return HttpResponse.json(mockTasks);
      }),
      http.get('/api/decompose/state', () => {
        return HttpResponse.json(mockDecomposeState);
      }),
      http.get('/api/ralph/progress', () => {
        return HttpResponse.text('');
      }),
      http.get('/api/settings/cli/detect', () => {
        return HttpResponse.json({
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: true, version: '2.1.2', command: 'claude' },
        });
      }),
      http.get('/api/settings', () => {
        return HttpResponse.json({
          specChat: { agent: 'claude', model: '', reasoningEffort: 'medium' },
          reviewer: { cli: 'codex' },
          decompose: {
            reviewer: {
              agent: 'claude',
              model: 'claude-3-sonnet',
              reasoningEffort: 'medium'
            }
          },
          condenser: {
            agent: 'claude',
            model: 'claude-3-sonnet',
            reasoningEffort: 'medium'
          },
          specGenerator: {
            agent: 'claude',
            model: 'claude-3-sonnet',
            reasoningEffort: 'medium'
          },
          taskRunner: {
            agent: 'claude',
            model: 'claude-3-sonnet',
            reasoningEffort: 'medium'
          },
          execution: { keepAwake: true }
        });
      }),
      http.get('/api/settings/models/detect', () => {
        return HttpResponse.json({
          claude: { available: true, command: 'claude', models: ['claude-3-opus', 'claude-3-sonnet'] },
          codex: { available: true, command: 'codex', models: ['codex-latest'] },
          openai: { available: false },
        });
      })
    );
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
      renderApp('/settings');

      // Wait for project to be auto-selected and rendered in TopNav
      await screen.findByText('test-project-1');

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
      renderApp('/settings');

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
      renderApp('/settings');

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

      // Wait for loading to finish - findBy waits internally
      await screen.findByRole('heading', { name: 'Settings' });

      const settingsButton = screen.getByTitle('Settings');

      // Settings button should have active styling (ShadCN uses bg-muted/80 class)
      await waitFor(() => {
        expect(settingsButton.className).toContain('bg-muted/80');
      });
    });

    it('should navigate to home when clicking logo', async () => {
      // Arrange
      setupMocks();

      // Act - start on settings page
      renderApp('/settings');

      // Wait for loading to finish
      await screen.findByRole('heading', { name: 'Settings' });

      // Navigate to home by clicking logo
      const logo = screen.getByTitle('Go to Home');
      fireEvent.click(logo);

      // Assert - should be on home page (home page doesn't have TopNav)
      await waitFor(() => {
        expect(screen.getByText('AI-powered development orchestration')).toBeInTheDocument();
      });
      
      // Settings button should no longer be visible (TopNav is not shown on home)
      expect(screen.queryByTitle('Settings')).not.toBeInTheDocument();
    });
  });

  describe('SettingsRoute_ShouldRenderSettingsView', () => {
    it('should render SettingsView when navigating directly to /settings', async () => {
      // Arrange
      setupMocks();

      // Act - render with /settings as initial route
      renderApp('/settings');

      // Assert - SettingsView should be rendered immediately (after loading)
      await screen.findByRole('heading', { name: 'Settings' });

      expect(screen.getByText('Decompose Reviewer')).toBeInTheDocument();

      // Settings button should have active styling
      const settingsButton = screen.getByTitle('Settings');
      expect(settingsButton.className).toContain('bg-muted/80');
    });
  });

  describe('Route_DirectNavigation_ShouldWork', () => {
    it('should render home page when URL is /', async () => {
      // Arrange
      setupMocks();

      // Act - render with / as initial route (home page has its own layout, no TopNav)
      renderApp('/');

      // Assert - Home page should render (TopNav is not shown on home page)
      await waitFor(() => {
        expect(screen.getByText('SPEKI')).toBeInTheDocument();
        expect(screen.getByText('AI-powered development orchestration')).toBeInTheDocument();
        expect(screen.getByText('test-project-1')).toBeInTheDocument();
      });
    });

    it('should render settings page when URL is /settings', async () => {
      // Arrange
      setupMocks();

      // Act - render with /settings as initial route
      renderApp('/settings');

      // Assert - Settings page should render
      await screen.findByRole('heading', { name: 'Settings' });
      expect(screen.getByText('Decompose Reviewer')).toBeInTheDocument();
    });
  });
});
