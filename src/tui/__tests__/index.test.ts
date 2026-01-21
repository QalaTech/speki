import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dependencies
vi.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
  },
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../core/settings.js', () => ({
  loadGlobalSettings: vi.fn(),
  saveGlobalSettings: vi.fn(),
}));

vi.mock('../../core/registry.js', () => ({
  Registry: vi.fn(),
}));

vi.mock('../../core/project.js', () => ({
  Project: vi.fn(),
}));

// Import after mocks are set up
import { input, confirm } from '@inquirer/prompts';
import { loadGlobalSettings, saveGlobalSettings } from '../../core/settings.js';
import { settingsScreen } from '../index.js';

describe('TUI Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('TUI_Settings_ValidAgent_Saves', () => {
    it('saves valid agent when user confirms', async () => {
      // Arrange
      const mockSettings = {
        decompose: {
          reviewer: {
            agent: 'claude' as const,
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        condenser: {
          agent: 'claude' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        specGenerator: {
          agent: 'claude' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        taskRunner: {
          agent: 'auto' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        specChat: {
          agent: 'claude' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        execution: {
          keepAwake: false,
        },
      };

      vi.mocked(loadGlobalSettings).mockResolvedValue(mockSettings);
      vi.mocked(confirm).mockResolvedValue(true);
      vi.mocked(input)
        .mockResolvedValueOnce('codex') // Agent input
        .mockResolvedValueOnce(''); // Model input (empty)

      // Act
      await settingsScreen();

      // Assert
      expect(saveGlobalSettings).toHaveBeenCalledWith({
        ...mockSettings,
        taskRunner: {
          agent: 'codex',
          model: undefined,
        },
      });
    });
  });

  describe('TUI_Settings_InvalidAgent_ShowsError', () => {
    it('shows error and returns for invalid agent', async () => {
      // Arrange
      const mockSettings = {
        decompose: {
          reviewer: {
            agent: 'claude' as const,
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        condenser: {
          agent: 'claude' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        specGenerator: {
          agent: 'claude' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        taskRunner: {
          agent: 'auto' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        specChat: {
          agent: 'claude' as const,
          model: 'claude-3-5-sonnet-20241022',
        },
        execution: {
          keepAwake: false,
        },
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(loadGlobalSettings).mockResolvedValue(mockSettings);
      vi.mocked(confirm).mockResolvedValue(true);
      vi.mocked(input)
        .mockResolvedValueOnce('invalid-agent') // Invalid agent input
        .mockResolvedValueOnce('model-test'); // Model input (won't be used)

      // Act
      await settingsScreen();

      // Assert
      // Verify error message was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid agent: invalid-agent')
      );

      // Verify saveGlobalSettings was NOT called
      expect(saveGlobalSettings).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
