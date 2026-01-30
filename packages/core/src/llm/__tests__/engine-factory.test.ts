import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GlobalSettings } from '../../types/index.js';

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

// Mock project module - will be customized per test
const mockProjectLoadConfig = vi.fn();
vi.mock('../../project.js', () => ({
  Project: class MockProject {
    constructor(public path: string) {}
    loadConfig = mockProjectLoadConfig;
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

vi.mock('../drivers/gemini-cli.js', () => ({
  GeminiCliEngine: class MockGeminiCliEngine {
    name = 'gemini-cli';
  },
}));

// Import after mocks
import { selectEngine } from '../engine-factory.js';
import { detectCli } from '../../cli-detect.js';

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

describe('selectEngine with project config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.QALA_ENGINE;
    delete process.env.QALA_MODEL;
    mockLoadGlobalSettings.mockResolvedValue(createDefaultSettings());
    mockProjectLoadConfig.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('selectEngine_ProjectConfigOverridesSettings', async () => {
    // Arrange - global settings say claude, project config says codex
    const settings = createDefaultSettings();
    settings.taskRunner.agent = 'claude';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    mockProjectLoadConfig.mockResolvedValue({
      llm: { engine: 'codex', model: 'project-model' },
    });

    // Act
    const result = await selectEngine({
      projectPath: '/test/project',
      purpose: 'taskRunner',
    });

    // Assert - project config should win over purpose settings
    expect(result.engineName).toBe('codex');
    expect(result.model).toBe('project-model');
  });

  it('selectEngine_CLIFlagsOverrideProjectConfig', async () => {
    // Arrange - project config says codex, but CLI flags say claude
    mockProjectLoadConfig.mockResolvedValue({
      llm: { engine: 'codex', model: 'project-model' },
    });

    // Act - CLI flags should override project config
    const result = await selectEngine({
      projectPath: '/test/project',
      engineName: 'claude',
      model: 'cli-model',
    });

    // Assert
    expect(result.engineName).toBe('claude');
    expect(result.model).toBe('cli-model');
  });
});

describe('selectEngine auto-detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.QALA_ENGINE;
    delete process.env.QALA_MODEL;
    mockLoadGlobalSettings.mockResolvedValue(createDefaultSettings());
    mockProjectLoadConfig.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('selectEngine_AutoDetect_PrefersClaude_WhenBothAvailable', async () => {
    // Arrange - taskRunner.agent is 'auto', both CLIs available
    const settings = createDefaultSettings();
    settings.taskRunner.agent = 'auto';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Mock both CLIs as available (default mock behavior)
    // detectCli already mocked to return both as available

    // Act
    const result = await selectEngine({
      purpose: 'taskRunner',
    });

    // Assert - should prefer Claude when both available
    expect(result.engineName).toBe('claude-cli');
  });

  it('selectEngine_AutoDetect_FallsBackToCodex_WhenClaudeUnavailable', async () => {
    // Arrange - taskRunner.agent is 'auto', only Codex available
    const settings = createDefaultSettings();
    settings.taskRunner.agent = 'auto';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    // Mock detectCli to return Claude unavailable, Codex available
    vi.mocked(detectCli).mockImplementation((cli: string) => {
      if (cli === 'claude') return Promise.resolve({ available: false, command: 'claude', version: '' });
      if (cli === 'codex') return Promise.resolve({ available: true, command: 'codex', version: '1.0.0' });
      return Promise.resolve({ available: false, command: cli, version: '' });
    });

    // Act
    const result = await selectEngine({
      purpose: 'taskRunner',
    });

    // Assert - should fall back to Codex
    expect(result.engineName).toBe('codex-cli');
  });

  it('selectEngine_FullPrecedence_CLIFlags_EnvVars_Project_Purpose_Auto', async () => {
    // Arrange - set all levels of precedence with different values
    const settings = createDefaultSettings();
    settings.taskRunner.agent = 'auto'; // 5th: auto-detect
    settings.taskRunner.model = 'purpose-model';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    mockProjectLoadConfig.mockResolvedValue({
      llm: { engine: 'codex', model: 'project-model' }, // 3rd: project config
    });

    process.env.QALA_ENGINE = 'codex'; // 2nd: env var (would say codex)
    process.env.QALA_MODEL = 'env-model';

    // Act - CLI flags have highest priority
    const result = await selectEngine({
      projectPath: '/test/project',
      engineName: 'claude', // 1st: CLI flag (highest priority)
      model: 'cli-model',
      purpose: 'taskRunner',
    });

    // Assert - CLI flag should win
    expect(result.engineName).toBe('claude');
    expect(result.model).toBe('cli-model');
  });
});

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

  it('selectEngine_ClaudeAliases_AcceptsAllVariations', async () => {
    // Arrange
    const claudeAliases = ['claude', 'claude-cli', 'CLAUDE', 'Claude-CLI'];

    for (const alias of claudeAliases) {
      // Act
      const result = await selectEngine({ engineName: alias });

      // Assert - all Claude aliases should work
      expect(result).toBeDefined();
      expect(result.engine).toBeDefined();
    }
  });

  it('selectEngine_CodexAliases_AcceptsAllVariations', async () => {
    // Arrange
    const codexAliases = ['codex', 'codex-cli', 'openai', 'CODEX', 'OpenAI'];

    for (const alias of codexAliases) {
      // Act
      const result = await selectEngine({ engineName: alias });

      // Assert - all Codex aliases should work
      expect(result).toBeDefined();
      expect(result.engine).toBeDefined();
    }
  });

  it('selectEngine_GeminiAliases_AcceptsAllVariations', async () => {
    const geminiAliases = ['gemini', 'gemini-cli', 'google', 'GEMINI', 'Google'];

    for (const alias of geminiAliases) {
      const result = await selectEngine({ engineName: alias });

      expect(result).toBeDefined();
      expect(result.engine).toBeDefined();
    }
  });

  it('selectEngine_AutoDetect_FallsBackToGemini_WhenClaudeAndCodexUnavailable', async () => {
    const settings = createDefaultSettings();
    settings.taskRunner.agent = 'auto';
    mockLoadGlobalSettings.mockResolvedValue(settings);

    vi.mocked(detectCli).mockImplementation((cli: string) => {
      if (cli === 'claude') return Promise.resolve({ available: false, command: 'claude', version: '' });
      if (cli === 'codex') return Promise.resolve({ available: false, command: 'codex', version: '' });
      if (cli === 'gemini') return Promise.resolve({ available: true, command: 'gemini', version: '0.20.0' });
      return Promise.resolve({ available: false, command: cli, version: '' });
    });

    const result = await selectEngine({ purpose: 'taskRunner' });

    expect(result.engineName).toBe('gemini-cli');
  });

  it('selectEngine_UnknownEngine_DefaultsToSafeFallback', async () => {
    // Arrange - use completely unknown engine name

    // Act
    const result = await selectEngine({ engineName: 'unknown-engine' });

    // Assert - should still return a valid engine (defaults to Claude)
    expect(result).toBeDefined();
    expect(result.engineName).toBe('unknown-engine');
    expect(result.engine).toBeDefined();
  });
});
