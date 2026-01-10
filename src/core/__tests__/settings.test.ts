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
    it('loadGlobalSettings_WithNoConfig_ShouldReturnClaudeAsDefaultCli', async () => {
      // Arrange
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFile).mockRejectedValue(enoentError);

      // Act
      const result = await loadGlobalSettings();

      // Assert
      expect(result.reviewer.cli).toBe('claude');
    });

    it('loadGlobalSettings_WithExplicitCodexConfig_ShouldReturnCodex', async () => {
      // Arrange
      const codexSettings = JSON.stringify({
        reviewer: {
          cli: 'codex',
        },
      });
      vi.mocked(readFile).mockResolvedValue(codexSettings);

      // Act
      const result = await loadGlobalSettings();

      // Assert
      expect(result.reviewer.cli).toBe('codex');
    });

    it('loadGlobalSettings_WithExplicitClaudeConfig_ShouldReturnClaude', async () => {
      // Arrange
      const claudeSettings = JSON.stringify({
        reviewer: {
          cli: 'claude',
        },
      });
      vi.mocked(readFile).mockResolvedValue(claudeSettings);

      // Act
      const result = await loadGlobalSettings();

      // Assert
      expect(result.reviewer.cli).toBe('claude');
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
      expect(result.reviewer.cli).toBe('claude');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not parse global settings file'),
        expect.any(String)
      );
    });
  });

  describe('saveGlobalSettings', () => {
    it('saveGlobalSettings_WithNewSettings_ShouldPersistToFile', async () => {
      // Arrange
      const newSettings = {
        reviewer: {
          cli: 'claude' as const,
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
        reviewer: {
          cli: 'codex' as const,
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
