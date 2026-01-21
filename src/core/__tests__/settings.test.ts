import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { loadGlobalSettings, saveGlobalSettings, getQalaDir, getSettingsFilePath } from '../settings.js';

// Mock fs/promises module
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

describe('settings', () => {
  const mockQalaDir = '/mock/home/.qala';
  const mockSettingsFile = '/mock/home/.qala/config.json';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('path helpers', () => {
    it('getQalaDir returns correct path', () => {
      expect(getQalaDir()).toBe(mockQalaDir);
    });

    it('getSettingsFilePath returns correct path', () => {
      expect(getSettingsFilePath()).toBe(mockSettingsFile);
    });
  });

  describe('loadGlobalSettings', () => {
    it('Settings_Load_ReturnsDefaults_WhenFileMissing', async () => {
      // Arrange
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFile).mockRejectedValue(enoentError);

      // Act
      const result = await loadGlobalSettings();

      // Assert
      expect(result).toHaveProperty('decompose');
      expect(result).toHaveProperty('condenser');
      expect(result).toHaveProperty('specGenerator');
      expect(result).toHaveProperty('taskRunner');
      expect(result).toHaveProperty('specChat');
      expect(result).toHaveProperty('execution');
    });

    it('loadGlobalSettings_WithExplicitClaudeConfig_ShouldReturnClaude', async () => {
      // Arrange
      const claudeSettings = JSON.stringify({
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
          keepAwake: true,
        },
      });
      vi.mocked(readFile).mockResolvedValue(claudeSettings);

      // Act
      const result = await loadGlobalSettings();

      // Assert
      expect(result.decompose.reviewer.agent).toBe('claude');
      expect(readFile).toHaveBeenCalledWith(mockSettingsFile, 'utf-8');
    });

    it('loadGlobalSettings_WithCorruptedJson_ShouldReturnDefaultsAndLogWarning', async () => {
      // Arrange
      const corruptedJson = '{ invalid json content';
      vi.mocked(readFile).mockResolvedValue(corruptedJson);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const result = await loadGlobalSettings();

      // Assert
      expect(result).toHaveProperty('decompose');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not parse global settings file'),
        expect.any(String)
      );
    });
  });

  describe('saveGlobalSettings', () => {
    it('Settings_Save_WritesToFile', async () => {
      // Arrange
      const newSettings = {
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
          keepAwake: true,
        },
      };
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      // Act
      await saveGlobalSettings(newSettings);

      // Assert
      expect(writeFile).toHaveBeenCalledWith(
        mockSettingsFile,
        JSON.stringify(newSettings, null, 2)
      );
    });

    it('saveGlobalSettings_WithMissingDirectory_ShouldCreateDirectoryAndFile', async () => {
      // Arrange
      const newSettings = {
        decompose: {
          reviewer: {
            agent: 'codex' as const,
            model: 'codex-latest',
          },
        },
        condenser: {
          agent: 'codex' as const,
          model: 'codex-latest',
        },
        specGenerator: {
          agent: 'codex' as const,
          model: 'codex-latest',
        },
        taskRunner: {
          agent: 'auto' as const,
          model: 'codex-latest',
        },
        specChat: {
          agent: 'codex' as const,
          model: 'codex-latest',
        },
        execution: {
          keepAwake: false,
        },
      };
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      // Act
      await saveGlobalSettings(newSettings);

      // Assert
      expect(mkdir).toHaveBeenCalledWith(mockQalaDir, { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        mockSettingsFile,
        JSON.stringify(newSettings, null, 2)
      );
    });
  });
});
