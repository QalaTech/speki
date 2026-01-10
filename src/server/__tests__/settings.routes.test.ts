import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import settingsRouter from '../routes/settings.js';
import * as settingsModule from '../../core/settings.js';
import * as cliDetectModule from '../../core/cli-detect.js';

// Mock the settings module
vi.mock('../../core/settings.js', () => ({
  loadGlobalSettings: vi.fn(),
  saveGlobalSettings: vi.fn(),
}));

// Mock the cli-detect module
vi.mock('../../core/cli-detect.js', () => ({
  detectAllClis: vi.fn(),
}));

describe('settings routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/settings', () => {
    it('GET_Settings_ShouldReturn200WithCurrentSettings', async () => {
      // Arrange
      const mockSettings = {
        reviewer: {
          cli: 'claude' as const,
        },
        execution: {
          keepAwake: true,
        },
      };
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(mockSettings);

      // Act
      const response = await request(app).get('/api/settings');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSettings);
      expect(settingsModule.loadGlobalSettings).toHaveBeenCalledTimes(1);
    });

    it('GET_Settings_WithNoConfig_ShouldReturnDefaultCodex', async () => {
      // Arrange
      const defaultSettings = {
        reviewer: {
          cli: 'codex' as const,
        },
        execution: {
          keepAwake: true,
        },
      };
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultSettings);

      // Act
      const response = await request(app).get('/api/settings');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        reviewer: {
          cli: 'codex',
        },
        execution: {
          keepAwake: true,
        },
      });
    });
  });

  describe('PUT /api/settings', () => {
    const defaultMockSettings = {
      reviewer: { cli: 'codex' as const },
      execution: { keepAwake: true },
    };

    it('PUT_Settings_WithValidCli_ShouldReturn200WithSuccessAndSettings', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      vi.mocked(settingsModule.saveGlobalSettings).mockResolvedValue(undefined);
      const requestBody = {
        reviewer: {
          cli: 'claude',
        },
      };

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        settings: {
          reviewer: {
            cli: 'claude',
          },
          execution: {
            keepAwake: true,
          },
        },
      });
      expect(settingsModule.saveGlobalSettings).toHaveBeenCalledWith({
        reviewer: {
          cli: 'claude',
        },
        execution: {
          keepAwake: true,
        },
      });
    });

    it('PUT_Settings_WithInvalidCli_ShouldReturn400BadRequest', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      const requestBody = {
        reviewer: {
          cli: 'invalid-cli',
        },
      };

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send(requestBody);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid CLI value');
      expect(response.body.details).toContain('codex');
      expect(response.body.details).toContain('claude');
      expect(settingsModule.saveGlobalSettings).not.toHaveBeenCalled();
    });

    it('PUT_Settings_WithMissingBody_ShouldMergeWithExistingSettings', async () => {
      // Arrange - PUT now merges, so empty body uses existing settings
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      vi.mocked(settingsModule.saveGlobalSettings).mockResolvedValue(undefined);

      // Act - Test with empty body
      const response = await request(app)
        .put('/api/settings')
        .send({});

      // Assert - should succeed and use existing settings
      expect(response.status).toBe(200);
      expect(response.body.settings).toEqual(defaultMockSettings);
    });

    it('PUT_Settings_ResponseShape_ShouldIncludeSuccessAndSettingsFields', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      vi.mocked(settingsModule.saveGlobalSettings).mockResolvedValue(undefined);
      const requestBody = {
        reviewer: {
          cli: 'codex',
        },
      };

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      // Verify exact response shape
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('settings');
      expect(response.body.settings).toHaveProperty('reviewer');
      expect(response.body.settings.reviewer).toHaveProperty('cli', 'codex');
      expect(response.body.settings).toHaveProperty('execution');
      expect(response.body.settings.execution).toHaveProperty('keepAwake', true);
      // Verify no extra properties at root level
      expect(Object.keys(response.body)).toEqual(['success', 'settings']);
    });

    it('PUT_Settings_WithExecution_ShouldUpdateKeepAwake', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      vi.mocked(settingsModule.saveGlobalSettings).mockResolvedValue(undefined);
      const requestBody = {
        execution: {
          keepAwake: false,
        },
      };

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.settings.execution.keepAwake).toBe(false);
      expect(response.body.settings.reviewer.cli).toBe('codex'); // Unchanged
    });
  });

  describe('GET /api/settings/cli/detect', () => {
    it('GET_CliDetect_ShouldReturn200WithDetectionResults', async () => {
      // Arrange
      const mockResults = {
        codex: { available: true, version: '0.39.0', command: 'codex' },
        claude: { available: true, version: '2.1.2', command: 'claude' },
      };
      vi.mocked(cliDetectModule.detectAllClis).mockResolvedValue(mockResults);

      // Act
      const response = await request(app).get('/api/settings/cli/detect');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResults);
      expect(cliDetectModule.detectAllClis).toHaveBeenCalledTimes(1);
    });

    it('GET_CliDetect_WithBothAvailable_ShouldShowBothTrueWithCommandField', async () => {
      // Arrange
      const mockResults = {
        codex: { available: true, version: '0.39.0', command: 'codex' },
        claude: { available: true, version: '2.1.2', command: 'claude' },
      };
      vi.mocked(cliDetectModule.detectAllClis).mockResolvedValue(mockResults);

      // Act
      const response = await request(app).get('/api/settings/cli/detect');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.codex.available).toBe(true);
      expect(response.body.codex.command).toBe('codex');
      expect(response.body.claude.available).toBe(true);
      expect(response.body.claude.command).toBe('claude');
    });

    it('GET_CliDetect_WithNoneAvailable_ShouldShowBothFalse', async () => {
      // Arrange
      const mockResults = {
        codex: { available: false, version: '', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      };
      vi.mocked(cliDetectModule.detectAllClis).mockResolvedValue(mockResults);

      // Act
      const response = await request(app).get('/api/settings/cli/detect');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.codex.available).toBe(false);
      expect(response.body.claude.available).toBe(false);
    });

    it('GET_CliDetect_ResponseShape_ShouldIncludeCommandFieldForEachCli', async () => {
      // Arrange
      const mockResults = {
        codex: { available: true, version: '0.39.0', command: 'codex' },
        claude: { available: false, version: '', command: 'claude' },
      };
      vi.mocked(cliDetectModule.detectAllClis).mockResolvedValue(mockResults);

      // Act
      const response = await request(app).get('/api/settings/cli/detect');

      // Assert
      expect(response.status).toBe(200);
      // Verify codex response shape
      expect(response.body.codex).toHaveProperty('available');
      expect(response.body.codex).toHaveProperty('version');
      expect(response.body.codex).toHaveProperty('command');
      // Verify claude response shape
      expect(response.body.claude).toHaveProperty('available');
      expect(response.body.claude).toHaveProperty('version');
      expect(response.body.claude).toHaveProperty('command');
      // Verify exact keys at root level
      expect(Object.keys(response.body)).toEqual(['codex', 'claude']);
    });
  });
});
