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
  detectAllModels: vi.fn(),
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

  describe('SettingsRoutes_GET_ReturnsCurrentSettings', () => {
    it('GET /api/settings returns 200 with current settings', async () => {
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

    it('GET /api/settings with default settings', async () => {
      // Arrange
      const defaultSettings = {
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
          keepAwake: true,
        },
      };
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultSettings);

      // Act
      const response = await request(app).get('/api/settings');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual(defaultSettings);
    });
  });

  describe('SettingsRoutes_PUT_UpdatesSettings', () => {
    const defaultMockSettings = {
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
        keepAwake: true,
      },
    };

    it('PUT /api/settings with valid agent updates settings', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      vi.mocked(settingsModule.saveGlobalSettings).mockResolvedValue(undefined);
      const requestBody = {
        decompose: {
          reviewer: {
            agent: 'claude',
          },
        },
      };

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('settings');
      expect(response.body.settings.decompose.reviewer.agent).toBe('claude');
      expect(settingsModule.saveGlobalSettings).toHaveBeenCalled();
    });

    it('PUT /api/settings with invalid agent returns 400', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      const requestBody = {
        decompose: {
          reviewer: {
            agent: 'invalid-agent',
          },
        },
      };

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send(requestBody);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(settingsModule.saveGlobalSettings).not.toHaveBeenCalled();
    });

    it('PUT /api/settings with empty body merges with existing settings', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      vi.mocked(settingsModule.saveGlobalSettings).mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send({});

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.settings).toEqual(defaultMockSettings);
    });

    it('PUT /api/settings response has correct shape', async () => {
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
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('settings');
      expect(Object.keys(response.body)).toEqual(['success', 'settings']);
    });

    it('PUT /api/settings allows taskRunner.agent to be auto', async () => {
      // Arrange
      vi.mocked(settingsModule.loadGlobalSettings).mockResolvedValue(defaultMockSettings);
      vi.mocked(settingsModule.saveGlobalSettings).mockResolvedValue(undefined);
      const requestBody = {
        taskRunner: {
          agent: 'auto',
        },
      };

      // Act
      const response = await request(app)
        .put('/api/settings')
        .send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.settings.taskRunner.agent).toBe('auto');
    });
  });

  describe('CLI detection endpoints', () => {
    it('GET /api/settings/cli/detect returns available CLIs', async () => {
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

    it('GET /api/settings/models/detect returns available models', async () => {
      // Arrange
      const mockResults = {
        codex: { available: true, models: ['codex-latest'] },
        claude: { available: true, models: ['claude-3-5-sonnet-20241022'] },
      };
      vi.mocked(cliDetectModule.detectAllModels).mockResolvedValue(mockResults);

      // Act
      const response = await request(app).get('/api/settings/models/detect');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResults);
    });
  });
});
