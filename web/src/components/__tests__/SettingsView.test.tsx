import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SettingsView } from '../SettingsView';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {};
const mockGetItem = vi.fn((key: string) => mockSessionStorage[key] ?? null);
const mockSetItem = vi.fn((key: string, value: string) => {
  mockSessionStorage[key] = value;
});
const mockClear = vi.fn(() => {
  Object.keys(mockSessionStorage).forEach((key) => delete mockSessionStorage[key]);
});

vi.stubGlobal('sessionStorage', {
  getItem: mockGetItem,
  setItem: mockSetItem,
  clear: mockClear,
  removeItem: vi.fn((key: string) => delete mockSessionStorage[key]),
});

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClear();
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
      // Arrange - settings must select an available CLI to avoid warning state
      setupMocks(
        {
          codex: { available: false, version: '', command: 'codex' },
          claude: { available: true, version: '2.1.2', command: 'claude' },
        },
        { reviewer: { cli: 'claude' } }
      );

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

  describe('handleSave_ShouldCallPutApiSettings', () => {
    it('should call PUT /api/settings when save button is clicked', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Reset mock to track only the PUT call
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, settings: { reviewer: { cli: 'codex' } } }),
      });

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      // Assert
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewer: { cli: 'codex' } }),
        });
      });
    });
  });

  describe('handleSave_WhileSaving_ShouldShowSavingState', () => {
    it('should show "Saving..." text while save is in progress', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Setup a delayed response to capture saving state
      mockFetch.mockClear();
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(pendingPromise);

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      // Assert - saving state should be shown
      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      // Button should be disabled while saving
      expect(saveButton).toBeDisabled();

      // Resolve the promise to clean up
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ success: true, settings: { reviewer: { cli: 'codex' } } }),
      });
    });
  });

  describe('handleSave_OnSuccess_ShouldShowSuccessMessage', () => {
    it('should show success message after successful save', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, settings: { reviewer: { cli: 'codex' } } }),
      });

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
      });
    });
  });

  describe('handleSave_OnError_ShouldShowErrorMessage', () => {
    it('should show error message when save fails with error response', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid CLI selection' }),
      });

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Invalid CLI selection')).toBeInTheDocument();
      });
    });

    it('should show generic error message when save throws an exception', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      mockFetch.mockClear();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('CliDetectionCache_OnFirstFetch_ShouldStoreInSessionStorage', () => {
    it('should store CLI detection results in sessionStorage after first API fetch', async () => {
      // Arrange
      setupMocks();

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Verify sessionStorage.setItem was called with the cached detection results
      expect(mockSetItem).toHaveBeenCalledWith(
        'qala_cli_detection_cache',
        JSON.stringify(mockCliDetection)
      );
    });
  });

  describe('CliDetectionCache_OnSubsequentFetch_ShouldUseCached', () => {
    it('should use cached results and skip API call when cache exists', async () => {
      // Arrange - pre-populate the cache
      const cachedDetection = {
        codex: { available: true, version: '0.39.0', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      };
      mockSessionStorage['qala_cli_detection_cache'] = JSON.stringify(cachedDetection);

      // Setup mock for settings API only (CLI detect should not be called)
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/settings/cli/detect')) {
          // This should NOT be called when cache exists
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockCliDetection),
          });
        }
        if (url.includes('/api/settings')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSettings),
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Verify that the CLI detection API was NOT called (cache was used)
      const cliDetectCalls = mockFetch.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/settings/cli/detect')
      );
      expect(cliDetectCalls).toHaveLength(0);

      // Verify sessionStorage.getItem was called to check for cache
      expect(mockGetItem).toHaveBeenCalledWith('qala_cli_detection_cache');

      // Verify the cached data was used (only Codex should be in dropdown)
      const dropdown = screen.getByRole('combobox');
      const options = dropdown.querySelectorAll('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Codex');
    });
  });

  describe('CliDetectionCache_OnIntraSessionNavigation_ShouldUseCached', () => {
    it('should reuse cached results when component re-renders without full page refresh', async () => {
      // Arrange - first render
      setupMocks();
      const { unmount } = render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Verify cache was populated
      expect(mockSetItem).toHaveBeenCalledWith(
        'qala_cli_detection_cache',
        JSON.stringify(mockCliDetection)
      );

      // Clear fetch mock to track second render
      mockFetch.mockClear();

      // Act - unmount and re-render (simulating navigation)
      unmount();
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Verify CLI detection API was NOT called on second render (used cache)
      const cliDetectCalls = mockFetch.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/settings/cli/detect')
      );
      expect(cliDetectCalls).toHaveLength(0);
    });
  });

  describe('CliDetectionCache_OnFullPageRefresh_ShouldRedetect', () => {
    it('should call API when sessionStorage is empty (simulating full page refresh)', async () => {
      // Arrange - ensure cache is empty (simulates full page refresh clearing sessionStorage)
      mockClear();
      setupMocks();

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Verify CLI detection API was called (no cache)
      expect(mockFetch).toHaveBeenCalledWith('/api/settings/cli/detect');

      // Verify new results were cached
      expect(mockSetItem).toHaveBeenCalledWith(
        'qala_cli_detection_cache',
        JSON.stringify(mockCliDetection)
      );
    });
  });

  describe('SettingsWarning_WithUnavailableSelectedCli_ShouldShowWarning', () => {
    it('should show warning indicator when selected CLI is unavailable', async () => {
      // Arrange - settings say claude is selected, but claude is not available
      setupMocks(
        {
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: false, version: '', command: 'claude' },
        },
        { reviewer: { cli: 'claude' } }
      );

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Check for warning indicator
      expect(screen.getByTitle('Selected CLI is unavailable')).toBeInTheDocument();
      expect(screen.getByText('⚠')).toBeInTheDocument();
    });

    it('should show warning message explaining the issue', async () => {
      // Arrange - settings say claude is selected, but claude is not available
      setupMocks(
        {
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: false, version: '', command: 'claude' },
        },
        { reviewer: { cli: 'claude' } }
      );

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Check for warning message
      expect(screen.getByText(/The selected CLI \(Claude\) is currently unavailable/)).toBeInTheDocument();
      expect(screen.getByText(/Please select a different CLI or reinstall the missing tool/)).toBeInTheDocument();
    });

    it('should show unavailable CLI in dropdown with "(unavailable)" suffix', async () => {
      // Arrange - settings say claude is selected, but claude is not available
      setupMocks(
        {
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: false, version: '', command: 'claude' },
        },
        { reviewer: { cli: 'claude' } }
      );

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Check that unavailable CLI is shown in dropdown with suffix
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toHaveValue('claude');

      // Check for the unavailable option text
      const unavailableOption = screen.getByRole('option', { name: 'Claude (unavailable)' });
      expect(unavailableOption).toBeInTheDocument();
    });

    it('should not show warning when selected CLI is available', async () => {
      // Arrange - settings say codex is selected, and codex is available
      setupMocks(
        {
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: false, version: '', command: 'claude' },
        },
        { reviewer: { cli: 'codex' } }
      );

      // Act
      render(<SettingsView />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Should not show warning indicator or message
      expect(screen.queryByTitle('Selected CLI is unavailable')).not.toBeInTheDocument();
      expect(screen.queryByText(/is currently unavailable/)).not.toBeInTheDocument();
    });
  });

  describe('SettingsWarning_ShouldAllowChangingSelection', () => {
    it('should allow user to change selection when selected CLI is unavailable', async () => {
      // Arrange - settings say claude is selected, but claude is not available
      setupMocks(
        {
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: false, version: '', command: 'claude' },
        },
        { reviewer: { cli: 'claude' } }
      );

      // Act
      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Dropdown should not be disabled
      const dropdown = screen.getByRole('combobox');
      expect(dropdown).not.toBeDisabled();

      // Change selection to codex
      fireEvent.change(dropdown, { target: { value: 'codex' } });

      // Assert - selection should change and warning should disappear
      expect(dropdown).toHaveValue('codex');
      expect(screen.queryByTitle('Selected CLI is unavailable')).not.toBeInTheDocument();
      expect(screen.queryByText(/is currently unavailable/)).not.toBeInTheDocument();
    });

    it('should show available CLI option when selected CLI is unavailable', async () => {
      // Arrange - settings say claude is selected, but claude is not available
      setupMocks(
        {
          codex: { available: true, version: '0.39.0', command: 'codex' },
          claude: { available: false, version: '', command: 'claude' },
        },
        { reviewer: { cli: 'claude' } }
      );

      // Act
      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
      });

      // Check that Codex is available as an option
      const codexOption = screen.getByRole('option', { name: 'Codex' });
      expect(codexOption).toBeInTheDocument();
    });
  });
});
