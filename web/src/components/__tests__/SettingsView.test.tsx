import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SettingsView } from '../SettingsView';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockCliDetection = {
    codex: { available: true, version: '0.39.0', command: 'codex' },
    claude: { available: true, version: '2.1.2', command: 'claude' },
  };

  const mockSettings = {
    reviewer: { cli: 'codex' as const },
  };

  const setupMocks = (
    cliDetection = mockCliDetection,
    settings = mockSettings
  ) => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/settings/cli/detect')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(cliDetection),
        });
      }
      if (url.includes('/api/settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(settings),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
  };

  describe('SettingsView_OnMount_ShouldFetchCliDetection', () => {
    it('should call CLI detection API on mount', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/cli/detect');
      });
    });
  });

  describe('SettingsView_OnMount_ShouldFetchCurrentSettings', () => {
    it('should call settings API on mount', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings');
      });
    });
  });

  describe('SettingsView_WithLoading_ShouldShowSpinner', () => {
    it('should show loading state initially', () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      // Assert
      expect(screen.getByText('Loading settings...')).toBeInTheDocument();
    });
  });

  describe('SettingsView_WithData_ShouldShowDropdownWithOnlyAvailableClis', () => {
    it('should only show available CLIs in dropdown when both available', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      const dropdown = screen.getByRole('combobox');
      const options = dropdown.querySelectorAll('option');

      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Codex');
      expect(options[1]).toHaveTextContent('Claude');
    });

    it('should only show codex in dropdown when only codex available', async () => {
      // Arrange
      setupMocks({
        codex: { available: true, version: '0.39.0', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      const dropdown = screen.getByRole('combobox');
      const options = dropdown.querySelectorAll('option');

      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Codex');
    });

    it('should only show claude in dropdown when only claude available', async () => {
      // Arrange
      setupMocks({
        codex: { available: false, version: '', command: 'codex' },
        claude: { available: true, version: '2.1.2', command: 'claude' },
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      const dropdown = screen.getByRole('combobox');
      const options = dropdown.querySelectorAll('option');

      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Claude');
    });
  });

  describe('SettingsView_StatusList_ShouldShowAllClisWithVersionsAndAvailability', () => {
    it('should show all CLIs with availability indicators and versions', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Check CLI status list section exists
      expect(screen.getByText('CLI Availability')).toBeInTheDocument();

      // Check Codex status item in status list (using class selector to distinguish from dropdown)
      const statusList = screen.getByText('CLI Availability').closest('.cli-status-list');
      expect(statusList).toBeInTheDocument();

      // Check versions are displayed
      expect(screen.getByText('0.39.0')).toBeInTheDocument();
      expect(screen.getByText('2.1.2')).toBeInTheDocument();

      // Check availability indicators (checkmarks)
      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks).toHaveLength(2);
    });

    it('should show unavailable CLIs with cross marks and "Not installed" text', async () => {
      // Arrange
      setupMocks({
        codex: { available: false, version: '', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Check "Not installed" appears for both
      const notInstalledTexts = screen.getAllByText('Not installed');
      expect(notInstalledTexts).toHaveLength(2);

      // Check cross marks
      const crossMarks = screen.getAllByText('✗');
      expect(crossMarks).toHaveLength(2);
    });

    it('should show mixed availability states correctly', async () => {
      // Arrange
      setupMocks({
        codex: { available: true, version: '0.39.0', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Check Codex is available with version
      expect(screen.getByText('0.39.0')).toBeInTheDocument();
      expect(screen.getByText('✓')).toBeInTheDocument();

      // Check Claude is unavailable
      expect(screen.getByText('Not installed')).toBeInTheDocument();
      expect(screen.getByText('✗')).toBeInTheDocument();
    });
  });

  describe('SettingsView_WithNoClisAvailable_ShouldShowErrorState', () => {
    it('should show error message when no CLIs are available', async () => {
      // Arrange
      setupMocks({
        codex: { available: false, version: '', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      expect(screen.getByText('No CLI tools are available. Please install Codex or Claude CLI.')).toBeInTheDocument();
    });

    it('should show "No CLIs available" in dropdown when none available', async () => {
      // Arrange
      setupMocks({
        codex: { available: false, version: '', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeDisabled();
      expect(screen.getByText('No CLIs available')).toBeInTheDocument();
    });

    it('should disable save button when no CLIs available', async () => {
      // Arrange
      setupMocks({
        codex: { available: false, version: '', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      expect(saveButton).toBeDisabled();
    });
  });
});
