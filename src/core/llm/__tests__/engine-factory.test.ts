import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GlobalSettings } from '../../../types/index.js';

// Mock settings module
const mockLoadGlobalSettings = vi.fn<() => Promise<GlobalSettings>>();
vi.mock('../../settings.js', () => ({
  loadGlobalSettings: () => mockLoadGlobalSettings(),
}));

// Mock cli-detect
vi.mock('../../cli-detect.js', () => ({
  detectCli: vi.fn().mockImplementation((cli: string) => {
    if (cli === 'claude') return Promise.resolve({ available: true, command: 'claude', version: '1.0.0' });
    if (cli === 'codex') return Promise.resolve({ available: true, command: 'codex', version: '1.0.0' });
    return Promise.resolve({ available: false, command: cli, version: '' });
  }),
}));

// Mock project module
vi.mock('../../project.js', () => ({
  Project: class MockProject {
    loadConfig = vi.fn().mockResolvedValue({});
  },
}));

// Mock engine drivers
vi.mock('../drivers/claude-cli.js', () => ({
  ClaudeCliEngine: class MockClaudeCliEngine {
    name = 'claude-cli';
  },
}));

vi.mock('../drivers/codex-cli.js', () => ({
  CodexCliEngine: class MockCodexCliEngine {
    name = 'codex-cli';
  },
}));

// Import after mocks
import { selectEngine } from '../engine-factory.js';

function createDefaultSettings(): GlobalSettings {
  return {
    decompose: {
      reviewer: { agent: 'claude', model: undefined, reasoningEffort: 'medium' },
    },
    condenser: { agent: 'claude', model: undefined, reasoningEffort: 'medium' },
    specGenerator: { agent: 'claude', model: undefined, reasoningEffort: 'medium' },
    taskRunner: { agent: 'auto', model: undefined, reasoningEffort: 'medium' },
    specChat: { agent: 'claude', model: undefined, reasoningEffort: 'medium' },
    execution: { keepAwake: true },
  };
}

describe('selectEngine with purpose parameter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.QALA_ENGINE;
    delete process.env.QALA_MODEL;
    mockLoadGlobalSettings.mockResolvedValue(createDefaultSettings());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('selectEngine_WithDecomposePurpose_UsesDecomposeReviewerSettings', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.decompose.reviewer.agent = 'codex';
    settings.decompose.reviewer.model = 'gpt-4o';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act
    const result = await selectEngine({ purpose: 'decompose' });

    // Assert
    expect(result.engineName).toBe('codex');
    expect(result.model).toBe('gpt-4o');
  });

  it('selectEngine_WithSpecChatPurpose_UsesSpecChatSettings', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.specChat.agent = 'codex';
    settings.specChat.model = 'o3-mini';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act
    const result = await selectEngine({ purpose: 'specChat' });

    // Assert
    expect(result.engineName).toBe('codex');
    expect(result.model).toBe('o3-mini');
  });

  it('selectEngine_WithCondenserPurpose_UsesCondenserSettings', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.condenser.agent = 'codex';
    settings.condenser.model = 'o1';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act
    const result = await selectEngine({ purpose: 'condenser' });

    // Assert
    expect(result.engineName).toBe('codex');
    expect(result.model).toBe('o1');
  });

  it('selectEngine_WithSpecGeneratorPurpose_UsesSpecGeneratorSettings', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.specGenerator.agent = 'codex';
    settings.specGenerator.model = 'gpt-4o-mini';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act
    const result = await selectEngine({ purpose: 'specGenerator' });

    // Assert
    expect(result.engineName).toBe('codex');
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('selectEngine_WithSpecReviewPurpose_UsesSpecChatSettings', async () => {
    // Arrange - specReview should reuse specChat settings
    const settings = createDefaultSettings();
    settings.specChat.agent = 'codex';
    settings.specChat.model = 'review-model';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act
    const result = await selectEngine({ purpose: 'specReview' });

    // Assert
    expect(result.engineName).toBe('codex');
    expect(result.model).toBe('review-model');
  });

  it('selectEngine_WithTaskRunnerPurpose_UsesTaskRunnerSettings', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.taskRunner.agent = 'claude';
    settings.taskRunner.model = 'opus-4';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act
    const result = await selectEngine({ purpose: 'taskRunner' });

    // Assert
    // Note: 'auto' would trigger auto-detection, but explicit 'claude' should use claude
    expect(result.model).toBe('opus-4');
  });

  it('selectEngine_WithNoPurpose_DefaultsToTaskRunner', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.taskRunner.agent = 'claude';
    settings.taskRunner.model = 'default-model';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act
    const result = await selectEngine({});

    // Assert
    expect(result.model).toBe('default-model');
  });

  it('selectEngine_CLIFlagsOverridePurposeSettings', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.decompose.reviewer.agent = 'codex';
    settings.decompose.reviewer.model = 'purpose-model';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Act - CLI flags should override purpose settings
    const result = await selectEngine({
      purpose: 'decompose',
      engineName: 'claude',
      model: 'cli-model',
    });

    // Assert
    expect(result.engineName).toBe('claude');
    expect(result.model).toBe('cli-model');
  });

  it('selectEngine_EnvVarsOverridePurposeSettings', async () => {
    // Arrange
    const settings = createDefaultSettings();
    settings.decompose.reviewer.agent = 'codex';
    settings.decompose.reviewer.model = 'purpose-model';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    process.env.QALA_ENGINE = 'claude';
    process.env.QALA_MODEL = 'env-model';

    // Act
    const result = await selectEngine({ purpose: 'decompose' });

    // Assert
    expect(result.engineName).toBe('claude');
    expect(result.model).toBe('env-model');
  });

  it('selectEngine_PrecedenceOrder_CLIFlagsFirst', async () => {
    // Arrange - Set up all levels
    const settings = createDefaultSettings();
    settings.decompose.reviewer.agent = 'codex';
    settings.decompose.reviewer.model = 'purpose-model';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    process.env.QALA_ENGINE = 'codex';
    process.env.QALA_MODEL = 'env-model';

    // Act - CLI flags should win
    const result = await selectEngine({
      purpose: 'decompose',
      engineName: 'claude',
      model: 'cli-model',
    });

    // Assert
    expect(result.engineName).toBe('claude');
    expect(result.model).toBe('cli-model');
  });
});
