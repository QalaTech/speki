import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  const setupMocks = () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/projects')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProjects),
        });
      }
      if (url.includes('/api/ralph/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRalphStatus),
        });
      }
      if (url.includes('/api/tasks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTasks),
        });
      }
      if (url.includes('/api/decompose/state')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDecomposeState),
        });
      }
      if (url.includes('/api/ralph/progress')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(''),
        });
      }
      if (url.includes('/api/settings/cli/detect')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            codex: { available: true, version: '0.39.0', command: 'codex' },
            claude: { available: true, version: '2.1.2', command: 'claude' },
          }),
        });
      }
      if (url.includes('/api/settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reviewer: { cli: 'codex' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });
    });
  };

  const renderApp = (initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    );
  };

  describe('SettingsNavItem_ShouldAppearInFooter', () => {
    it('should render Settings button in nav-footer', async () => {
      // Arrange
      setupMocks();

      // Act
      renderApp();

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const navFooter = document.querySelector('.nav-footer');
      expect(navFooter).toBeInTheDocument();

      const settingsButton = screen.getByRole('button', { name: /settings/i });
      expect(settingsButton).toBeInTheDocument();
      expect(settingsButton.closest('.nav-footer')).toBeInTheDocument();
    });

    it('should display gear icon with Settings label', async () => {
      // Arrange
      setupMocks();

      // Act
      renderApp();

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const settingsButton = screen.getByRole('button', { name: /settings/i });
      expect(settingsButton).toBeInTheDocument();

      // Check for gear icon (&#9881; = ⚙)
      const navIcon = settingsButton.querySelector('.nav-icon');
      expect(navIcon).toBeInTheDocument();

      // Check for Settings label
      const navLabel = settingsButton.querySelector('.nav-label');
      expect(navLabel).toBeInTheDocument();
      expect(navLabel).toHaveTextContent('Settings');
    });
  });

  describe('SettingsNavItem_OnClick_ShouldNavigateToSettings', () => {
    it('should show SettingsView when Settings button is clicked', async () => {
      // Arrange
      setupMocks();

      // Act
      renderApp();

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const settingsButton = screen.getByRole('button', { name: /settings/i });
      fireEvent.click(settingsButton);

      // Assert - SettingsView should be rendered (it shows "Settings" heading and "Decomposition Reviewer" section)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
      });

      expect(screen.getByText('Decomposition Reviewer')).toBeInTheDocument();
    });
  });

  describe('SettingsNavItem_WhenActive_ShouldShowActiveStyle', () => {
    it('should have active class when on settings page', async () => {
      // Arrange
      setupMocks();

      // Act
      renderApp();

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const settingsButton = screen.getByRole('button', { name: /settings/i });

      // Initially should not have active class
      expect(settingsButton).not.toHaveClass('active');

      // Click to navigate to settings
      fireEvent.click(settingsButton);

      // Assert - should now have active class
      await waitFor(() => {
        expect(settingsButton).toHaveClass('active');
      });
    });

    it('should remove active class when navigating away from settings', async () => {
      // Arrange
      setupMocks();

      // Act
      renderApp();

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      const settingsButton = screen.getByRole('button', { name: /settings/i });
      const executionButton = screen.getByRole('button', { name: /execution/i });

      // Click to navigate to settings
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(settingsButton).toHaveClass('active');
      });

      // Click to navigate to execution
      fireEvent.click(executionButton);

      // Assert - settings should no longer have active class
      await waitFor(() => {
        expect(settingsButton).not.toHaveClass('active');
        expect(executionButton).toHaveClass('active');
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

      expect(screen.getByText('Decomposition Reviewer')).toBeInTheDocument();

      // Settings button should have active class (use querySelector to be specific)
      const settingsButton = document.querySelector('.settings-nav-item');
      expect(settingsButton).toHaveClass('active');
    });
  });

  describe('SettingsRoute_DirectNavigation_ShouldWork', () => {
    it('should show correct content when URL is /decompose', async () => {
      // Arrange
      setupMocks();

      // Act - render with /decompose as initial route
      renderApp('/decompose');

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      // Assert - Decompose button should have active class
      const decomposeButton = screen.getByRole('button', { name: /decompose/i });
      expect(decomposeButton).toHaveClass('active');

      // Settings button should NOT have active class
      const settingsButton = screen.getByRole('button', { name: /settings/i });
      expect(settingsButton).not.toHaveClass('active');
    });

    it('should show execution content when URL is /', async () => {
      // Arrange
      setupMocks();

      // Act - render with / as initial route
      renderApp('/');

      await waitFor(() => {
        expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument();
      });

      // Assert - Execution button should have active class
      const executionButton = screen.getByRole('button', { name: /execution/i });
      expect(executionButton).toHaveClass('active');
    });
  });
});
