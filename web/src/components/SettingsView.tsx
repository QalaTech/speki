import { useState, useEffect, useCallback } from 'react';
import './SettingsView.css';
import type {
  AllCliDetectionResults,
  AllModelDetectionResults,
  GlobalSettings,
  CliType,
  ReasoningEffort
} from '../types.js';

/** Valid reasoning effort levels for Codex */
const REASONING_EFFORTS: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

// Session storage key for CLI detection caching
const CLI_DETECTION_CACHE_KEY = 'qala_cli_detection_cache';

/**
 * Get cached CLI detection results from sessionStorage
 */
function getCachedCliDetection(): AllCliDetectionResults | null {
  try {
    const cached = sessionStorage.getItem(CLI_DETECTION_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('Failed to parse cached CLI detection:', err);
  }
  return null;
}

/**
 * Store CLI detection results in sessionStorage
 */
function setCachedCliDetection(detection: AllCliDetectionResults): void {
  try {
    sessionStorage.setItem(CLI_DETECTION_CACHE_KEY, JSON.stringify(detection));
  } catch (err) {
    console.error('Failed to cache CLI detection:', err);
  }
}

export function SettingsView() {
  const [cliDetection, setCliDetection] = useState<AllCliDetectionResults | null>(null);
  const [modelDetection, setModelDetection] = useState<AllModelDetectionResults | null>(null);
  const [_settings, setSettings] = useState<GlobalSettings | null>(null);

  // Decompose reviewer settings
  const [decomposeAgent, setDecomposeAgent] = useState<CliType>('claude');
  const [decomposeModel, setDecomposeModel] = useState<string>('');
  const [decomposeReasoningEffort, setDecomposeReasoningEffort] = useState<ReasoningEffort>('medium');

  // Condenser settings
  const [condenserAgent, setCondenserAgent] = useState<CliType>('claude');
  const [condenserModel, setCondenserModel] = useState<string>('');
  const [condenserReasoningEffort, setCondenserReasoningEffort] = useState<ReasoningEffort>('medium');

  // Spec generator settings
  const [specGenAgent, setSpecGenAgent] = useState<CliType>('claude');
  const [specGenModel, setSpecGenModel] = useState<string>('');
  const [specGenReasoningEffort, setSpecGenReasoningEffort] = useState<ReasoningEffort>('medium');

  // Task runner settings
  const [taskRunnerAgent, setTaskRunnerAgent] = useState<'auto' | CliType>('auto');
  const [taskRunnerModel, setTaskRunnerModel] = useState<string>('');
  const [taskRunnerReasoningEffort, setTaskRunnerReasoningEffort] = useState<ReasoningEffort>('medium');

  // Spec chat settings
  const [specChatAgent, setSpecChatAgent] = useState<CliType>('claude');
  const [specChatModel, setSpecChatModel] = useState<string>('');
  const [specChatReasoningEffort, setSpecChatReasoningEffort] = useState<ReasoningEffort>('medium');

  // Execution settings
  const [keepAwake, setKeepAwake] = useState<boolean>(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchCliDetection = useCallback(async (): Promise<AllCliDetectionResults | null> => {
    // Check cache first
    const cached = getCachedCliDetection();
    if (cached) {
      return cached;
    }

    // No cache, fetch from API
    try {
      const res = await fetch('/api/settings/cli/detect');
      if (!res.ok) {
        throw new Error('Failed to fetch CLI detection');
      }
      const detection = await res.json();

      // Cache the result for subsequent fetches within this session
      setCachedCliDetection(detection);

      return detection;
    } catch (err) {
      console.error('Failed to fetch CLI detection:', err);
      return null;
    }
  }, []);

  const fetchModelDetection = useCallback(async (): Promise<AllModelDetectionResults | null> => {
    try {
      const res = await fetch('/api/settings/models/detect');
      if (!res.ok) {
        throw new Error('Failed to fetch model detection');
      }
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch model detection:', err);
      return null;
    }
  }, []);

  const fetchSettings = useCallback(async (): Promise<GlobalSettings | null> => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) {
        throw new Error('Failed to fetch settings');
      }
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      const [detection, models, currentSettings] = await Promise.all([
        fetchCliDetection(),
        fetchModelDetection(),
        fetchSettings()
      ]);

      setCliDetection(detection);
      setModelDetection(models);
      setSettings(currentSettings);

      if (currentSettings) {
        // Load decompose settings
        setDecomposeAgent(currentSettings.decompose.reviewer.agent as CliType);
        setDecomposeModel(currentSettings.decompose.reviewer.model || '');
        setDecomposeReasoningEffort(currentSettings.decompose.reviewer.reasoningEffort || 'medium');

        // Load condenser settings
        setCondenserAgent(currentSettings.condenser.agent as CliType);
        setCondenserModel(currentSettings.condenser.model || '');
        setCondenserReasoningEffort(currentSettings.condenser.reasoningEffort || 'medium');

        // Load spec generator settings
        setSpecGenAgent(currentSettings.specGenerator.agent as CliType);
        setSpecGenModel(currentSettings.specGenerator.model || '');
        setSpecGenReasoningEffort(currentSettings.specGenerator.reasoningEffort || 'medium');

        // Load task runner settings
        setTaskRunnerAgent(currentSettings.taskRunner.agent);
        setTaskRunnerModel(currentSettings.taskRunner.model || '');
        setTaskRunnerReasoningEffort(currentSettings.taskRunner.reasoningEffort || 'medium');

        // Load spec chat settings
        setSpecChatAgent(currentSettings.specChat?.agent || 'claude');
        setSpecChatModel(currentSettings.specChat?.model || '');
        setSpecChatReasoningEffort(currentSettings.specChat?.reasoningEffort || 'medium');

        // Load execution settings
        setKeepAwake(currentSettings.execution?.keepAwake ?? true);
      }

      // Check if no CLIs are available
      if (detection && !detection.codex.available && !detection.claude.available) {
        setError('No CLI tools are available. Please install Codex or Claude CLI.');
      }

      setLoading(false);
    };

    loadData();
  }, [fetchCliDetection, fetchModelDetection, fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decompose: {
            reviewer: {
              agent: decomposeAgent,
              model: decomposeModel || undefined,
              reasoningEffort: decomposeAgent === 'codex' ? decomposeReasoningEffort : undefined,
            },
          },
          condenser: {
            agent: condenserAgent,
            model: condenserModel || undefined,
            reasoningEffort: condenserAgent === 'codex' ? condenserReasoningEffort : undefined,
          },
          specGenerator: {
            agent: specGenAgent,
            model: specGenModel || undefined,
            reasoningEffort: specGenAgent === 'codex' ? specGenReasoningEffort : undefined,
          },
          taskRunner: {
            agent: taskRunnerAgent,
            model: taskRunnerModel || undefined,
            reasoningEffort: taskRunnerAgent === 'codex' ? taskRunnerReasoningEffort : undefined,
          },
          specChat: {
            agent: specChatAgent,
            model: specChatModel || undefined,
            reasoningEffort: specChatAgent === 'codex' ? specChatReasoningEffort : undefined,
          },
          execution: { keepAwake },
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setSettings(data.settings);
      setSaveSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Get list of available CLIs for dropdown
  const getAvailableClis = (): CliType[] => {
    if (!cliDetection) return [];
    const available: CliType[] = [];
    if (cliDetection.codex.available) available.push('codex');
    if (cliDetection.claude.available) available.push('claude');
    return available;
  };

  const availableClis = getAvailableClis();

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <div className="loader">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>Settings</h2>
        <p>Configure agent and model variants for different task stages</p>
      </div>

      {error && (
        <div className="settings-error-banner">
          <span className="error-icon">&#9888;</span>
          {error}
        </div>
      )}

      {/* Decompose Reviewer Section */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Decompose Reviewer</h3>
          <p>Agent and model used for peer review during PRD decomposition</p>
        </div>

        <div className="section-content">
          <div className="config-field">
            <label>Agent</label>
            <div className="select-wrapper">
              <select
                value={decomposeAgent}
                onChange={(e) => setDecomposeAgent(e.target.value as CliType)}
                disabled={availableClis.length === 0 || saving}
              >
                {availableClis.length === 0 ? (
                  <option value="">No agents available</option>
                ) : (
                  availableClis.map((cli) => (
                    <option key={cli} value={cli}>
                      {cli.charAt(0).toUpperCase() + cli.slice(1)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="config-field">
            <label>Model</label>
            <input
              type="text"
              value={decomposeModel}
              onChange={(e) => setDecomposeModel(e.target.value)}
              placeholder={decomposeAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., sonnet, opus'}
              disabled={saving}
              list="decompose-models"
            />
            {modelDetection && modelDetection[decomposeAgent]?.models.length > 0 && (
              <datalist id="decompose-models">
                {modelDetection[decomposeAgent].models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
            <p className="field-description">
              Optional model identifier. Leave empty for default.
            </p>
          </div>

          {decomposeAgent === 'codex' && (
            <div className="config-field">
              <label>Reasoning Effort</label>
              <div className="select-wrapper">
                <select
                  value={decomposeReasoningEffort}
                  onChange={(e) => setDecomposeReasoningEffort(e.target.value as ReasoningEffort)}
                  disabled={saving}
                >
                  {REASONING_EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort.charAt(0).toUpperCase() + effort.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="field-description">
                Controls reasoning depth for Codex models. Higher = more thorough but slower.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Spec Condenser Section */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Spec Condenser</h3>
          <p>Agent and model for optimizing PRD for LLM consumption (reducing tokens)</p>
        </div>

        <div className="section-content">
          <div className="config-field">
            <label>Agent</label>
            <div className="select-wrapper">
              <select
                value={condenserAgent}
                onChange={(e) => setCondenserAgent(e.target.value as CliType)}
                disabled={availableClis.length === 0 || saving}
              >
                {availableClis.length === 0 ? (
                  <option value="">No agents available</option>
                ) : (
                  availableClis.map((cli) => (
                    <option key={cli} value={cli}>
                      {cli.charAt(0).toUpperCase() + cli.slice(1)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="config-field">
            <label>Model</label>
            <input
              type="text"
              value={condenserModel}
              onChange={(e) => setCondenserModel(e.target.value)}
              placeholder={condenserAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., haiku, sonnet'}
              disabled={saving}
              list="condenser-models"
            />
            {modelDetection && modelDetection[condenserAgent]?.models.length > 0 && (
              <datalist id="condenser-models">
                {modelDetection[condenserAgent].models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
            <p className="field-description">
              Optional model identifier. Leave empty for default.
            </p>
          </div>

          {condenserAgent === 'codex' && (
            <div className="config-field">
              <label>Reasoning Effort</label>
              <div className="select-wrapper">
                <select
                  value={condenserReasoningEffort}
                  onChange={(e) => setCondenserReasoningEffort(e.target.value as ReasoningEffort)}
                  disabled={saving}
                >
                  {REASONING_EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort.charAt(0).toUpperCase() + effort.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="field-description">
                Controls reasoning depth for Codex models. Higher = more thorough but slower.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Spec Generator Section */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Spec Generator</h3>
          <p>Agent and model used to draft PRDs or technical specs</p>
        </div>

        <div className="section-content">
          <div className="config-field">
            <label>Agent</label>
            <div className="select-wrapper">
              <select
                value={specGenAgent}
                onChange={(e) => setSpecGenAgent(e.target.value as CliType)}
                disabled={availableClis.length === 0 || saving}
              >
                {availableClis.length === 0 ? (
                  <option value="">No agents available</option>
                ) : (
                  availableClis.map((cli) => (
                    <option key={cli} value={cli}>
                      {cli.charAt(0).toUpperCase() + cli.slice(1)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="config-field">
            <label>Model</label>
            <input
              type="text"
              value={specGenModel}
              onChange={(e) => setSpecGenModel(e.target.value)}
              placeholder={specGenAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., sonnet, haiku'}
              disabled={saving}
              list="specgen-models"
            />
            {modelDetection && modelDetection[specGenAgent]?.models.length > 0 && (
              <datalist id="specgen-models">
                {modelDetection[specGenAgent].models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
            <p className="field-description">
              Optional model identifier. Leave empty for default.
            </p>
          </div>

          {specGenAgent === 'codex' && (
            <div className="config-field">
              <label>Reasoning Effort</label>
              <div className="select-wrapper">
                <select
                  value={specGenReasoningEffort}
                  onChange={(e) => setSpecGenReasoningEffort(e.target.value as ReasoningEffort)}
                  disabled={saving}
                >
                  {REASONING_EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort.charAt(0).toUpperCase() + effort.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="field-description">
                Controls reasoning depth for Codex models. Higher = more thorough but slower.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Task Runner Section */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Task Runner</h3>
          <p>Agent and model for executing user stories</p>
        </div>

        <div className="section-content">
          <div className="config-field">
            <label>Agent</label>
            <div className="select-wrapper">
              <select
                value={taskRunnerAgent}
                onChange={(e) => setTaskRunnerAgent(e.target.value as 'auto' | CliType)}
                disabled={saving}
              >
                <option value="auto">Auto (detect first available)</option>
                {cliDetection?.claude.available && (
                  <option value="claude">Claude</option>
                )}
                {cliDetection?.codex.available && (
                  <option value="codex">Codex</option>
                )}
              </select>
            </div>
            <p className="field-description">
              Auto selects the first available agent. You can override per-run using --engine/--model flags.
            </p>
          </div>

          <div className="config-field">
            <label>Model</label>
            <input
              type="text"
              value={taskRunnerModel}
              onChange={(e) => setTaskRunnerModel(e.target.value)}
              placeholder={taskRunnerAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., sonnet, opus'}
              disabled={saving}
              list="taskrunner-models"
            />
            {modelDetection && taskRunnerAgent !== 'auto' && modelDetection[taskRunnerAgent as CliType]?.models.length > 0 && (
              <datalist id="taskrunner-models">
                {modelDetection[taskRunnerAgent as CliType].models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
            <p className="field-description">
              Optional model identifier. Leave empty for default.
            </p>
          </div>

          {taskRunnerAgent === 'codex' && (
            <div className="config-field">
              <label>Reasoning Effort</label>
              <div className="select-wrapper">
                <select
                  value={taskRunnerReasoningEffort}
                  onChange={(e) => setTaskRunnerReasoningEffort(e.target.value as ReasoningEffort)}
                  disabled={saving}
                >
                  {REASONING_EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort.charAt(0).toUpperCase() + effort.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="field-description">
                Controls reasoning depth for Codex models. Higher = more thorough but slower.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Spec Chat Section */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Spec Chat</h3>
          <p>Agent and model for interactive chat during spec review</p>
        </div>

        <div className="section-content">
          <div className="config-field">
            <label>Agent</label>
            <div className="select-wrapper">
              <select
                value={specChatAgent}
                onChange={(e) => setSpecChatAgent(e.target.value as CliType)}
                disabled={availableClis.length === 0 || saving}
              >
                {availableClis.length === 0 ? (
                  <option value="">No agents available</option>
                ) : (
                  availableClis.map((cli) => (
                    <option key={cli} value={cli}>
                      {cli.charAt(0).toUpperCase() + cli.slice(1)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="config-field">
            <label>Model</label>
            <input
              type="text"
              value={specChatModel}
              onChange={(e) => setSpecChatModel(e.target.value)}
              placeholder={specChatAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., sonnet, opus'}
              disabled={saving}
              list="specchat-models"
            />
            {modelDetection && modelDetection[specChatAgent]?.models.length > 0 && (
              <datalist id="specchat-models">
                {modelDetection[specChatAgent].models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
            <p className="field-description">
              Optional model identifier. Leave empty for default.
            </p>
          </div>

          {specChatAgent === 'codex' && (
            <div className="config-field">
              <label>Reasoning Effort</label>
              <div className="select-wrapper">
                <select
                  value={specChatReasoningEffort}
                  onChange={(e) => setSpecChatReasoningEffort(e.target.value as ReasoningEffort)}
                  disabled={saving}
                >
                  {REASONING_EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort.charAt(0).toUpperCase() + effort.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="field-description">
                Controls reasoning depth for Codex models. Higher = more thorough but slower.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* CLI Status Display */}
      <div className="settings-section">
        <div className="section-header">
          <h3>CLI Availability</h3>
          <p>Detected CLI tools and their versions</p>
        </div>

        <div className="section-content">
          <div className="cli-status-list">
            {cliDetection && (
              <>
                <div className={`cli-status-item ${cliDetection.codex.available ? 'available' : 'unavailable'}`}>
                  <span className="cli-status-indicator">
                    {cliDetection.codex.available ? '✓' : '✗'}
                  </span>
                  <span className="cli-status-name">Codex</span>
                  <span className="cli-status-version">
                    {cliDetection.codex.available ? cliDetection.codex.version : 'Not installed'}
                  </span>
                </div>
                <div className={`cli-status-item ${cliDetection.claude.available ? 'available' : 'unavailable'}`}>
                  <span className="cli-status-indicator">
                    {cliDetection.claude.available ? '✓' : '✗'}
                  </span>
                  <span className="cli-status-name">Claude</span>
                  <span className="cli-status-version">
                    {cliDetection.claude.available ? cliDetection.claude.version : 'Not installed'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Execution Settings */}
      <div className="settings-section">
        <div className="section-header">
          <h3>Execution</h3>
          <p>Configure how tasks are executed</p>
        </div>

        <div className="section-content">
          <div className="config-field">
            <label htmlFor="keep-awake-toggle">Prevent System Sleep</label>
            <div className="toggle-wrapper">
              <label className="toggle">
                <input
                  id="keep-awake-toggle"
                  type="checkbox"
                  checked={keepAwake}
                  onChange={(e) => setKeepAwake(e.target.checked)}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toggle-label">{keepAwake ? 'Enabled' : 'Disabled'}</span>
            </div>
            <p className="field-description">
              Prevents your computer from sleeping during long-running tasks.
              Recommended for overnight runs.
            </p>
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || availableClis.length === 0}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {saveSuccess && (
          <span className="save-success">Settings saved successfully!</span>
        )}

        {saveError && (
          <span className="save-error">{saveError}</span>
        )}
      </div>
    </div>
  );
}
