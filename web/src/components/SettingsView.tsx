import { useState, useEffect, useCallback } from 'react';
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

function setCachedCliDetection(detection: AllCliDetectionResults): void {
  try {
    sessionStorage.setItem(CLI_DETECTION_CACHE_KEY, JSON.stringify(detection));
  } catch (err) {
    console.error('Failed to cache CLI detection:', err);
  }
}

// Reusable form field component
function ConfigField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 max-w-[300px]">
      <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">{label}</label>
      {children}
      {description && (
        <p className="mt-1 text-[13px] text-text-muted leading-relaxed max-w-[400px]">{description}</p>
      )}
    </div>
  );
}

// Reusable section component
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gradient-to-br from-surface/95 to-bg/98 border border-border rounded-2xl p-6 shadow-lg">
      <div className="mb-6">
        <h3 className="m-0 mb-1 text-lg font-semibold text-text">{title}</h3>
        <p className="m-0 text-sm text-text-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}

// Select input styling
const selectClassName = "px-4 py-3 bg-bg/80 border border-border rounded-xl text-text text-sm transition-all duration-200 hover:border-text-muted hover:bg-bg/95 focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15),0_0_20px_rgba(88,166,255,0.1)] focus:bg-bg disabled:opacity-40 disabled:cursor-not-allowed";

// Input styling
const inputClassName = "px-4 py-3 bg-bg/80 border border-border rounded-xl text-text text-sm transition-all duration-200 hover:border-text-muted hover:bg-bg/95 focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15),0_0_20px_rgba(88,166,255,0.1)] focus:bg-bg disabled:opacity-40 disabled:cursor-not-allowed";

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
    const cached = getCachedCliDetection();
    if (cached) return cached;

    try {
      const res = await fetch('/api/settings/cli/detect');
      if (!res.ok) throw new Error('Failed to fetch CLI detection');
      const detection = await res.json();
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
      if (!res.ok) throw new Error('Failed to fetch model detection');
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch model detection:', err);
      return null;
    }
  }, []);

  const fetchSettings = useCallback(async (): Promise<GlobalSettings | null> => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
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
        setDecomposeAgent(currentSettings.decompose.reviewer.agent as CliType);
        setDecomposeModel(currentSettings.decompose.reviewer.model || '');
        setDecomposeReasoningEffort(currentSettings.decompose.reviewer.reasoningEffort || 'medium');
        setCondenserAgent(currentSettings.condenser.agent as CliType);
        setCondenserModel(currentSettings.condenser.model || '');
        setCondenserReasoningEffort(currentSettings.condenser.reasoningEffort || 'medium');
        setSpecGenAgent(currentSettings.specGenerator.agent as CliType);
        setSpecGenModel(currentSettings.specGenerator.model || '');
        setSpecGenReasoningEffort(currentSettings.specGenerator.reasoningEffort || 'medium');
        setTaskRunnerAgent(currentSettings.taskRunner.agent);
        setTaskRunnerModel(currentSettings.taskRunner.model || '');
        setTaskRunnerReasoningEffort(currentSettings.taskRunner.reasoningEffort || 'medium');
        setSpecChatAgent(currentSettings.specChat?.agent || 'claude');
        setSpecChatModel(currentSettings.specChat?.model || '');
        setSpecChatReasoningEffort(currentSettings.specChat?.reasoningEffort || 'medium');
        setKeepAwake(currentSettings.execution?.keepAwake ?? true);
      }

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
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');

      setSettings(data.settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getAvailableClis = (): CliType[] => {
    if (!cliDetection) return [];
    const available: CliType[] = [];
    if (cliDetection.codex.available) available.push('codex');
    if (cliDetection.claude.available) available.push('claude');
    return available;
  };

  const availableClis = getAvailableClis();

  // Render agent/model/reasoning fields for a section
  const renderAgentFields = (
    agentValue: CliType,
    setAgent: (v: CliType) => void,
    modelValue: string,
    setModel: (v: string) => void,
    reasoningValue: ReasoningEffort,
    setReasoning: (v: ReasoningEffort) => void,
    datalistId: string,
    placeholder: string
  ) => (
    <>
      <ConfigField label="Agent">
        <select
          className={selectClassName}
          value={agentValue}
          onChange={(e) => setAgent(e.target.value as CliType)}
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
      </ConfigField>

      <ConfigField label="Model" description="Optional model identifier. Leave empty for default.">
        <input
          type="text"
          className={inputClassName}
          value={modelValue}
          onChange={(e) => setModel(e.target.value)}
          placeholder={placeholder}
          disabled={saving}
          list={datalistId}
        />
        {modelDetection && modelDetection[agentValue]?.models.length > 0 && (
          <datalist id={datalistId}>
            {modelDetection[agentValue].models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        )}
      </ConfigField>

      {agentValue === 'codex' && (
        <ConfigField label="Reasoning Effort" description="Controls reasoning depth for Codex models. Higher = more thorough but slower.">
          <select
            className={selectClassName}
            value={reasoningValue}
            onChange={(e) => setReasoning(e.target.value as ReasoningEffort)}
            disabled={saving}
          >
            {REASONING_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort.charAt(0).toUpperCase() + effort.slice(1)}
              </option>
            ))}
          </select>
        </ConfigField>
      )}
    </>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full min-h-0">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-xl text-text-muted">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full min-h-0">
      <div className="mb-2">
        <h2 className="m-0 mb-1 text-2xl font-semibold text-text">Settings</h2>
        <p className="m-0 text-[15px] text-text-muted">Configure agent and model variants for different task stages</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-6 py-4 bg-blocked/15 border border-blocked rounded-xl text-blocked text-[15px]">
          <span className="text-xl">⚠</span>
          {error}
        </div>
      )}

      {/* Decompose Reviewer Section */}
      <SettingsSection title="Decompose Reviewer" description="Agent and model used for peer review during PRD decomposition">
        {renderAgentFields(
          decomposeAgent, setDecomposeAgent,
          decomposeModel, setDecomposeModel,
          decomposeReasoningEffort, setDecomposeReasoningEffort,
          'decompose-models',
          decomposeAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., sonnet, opus'
        )}
      </SettingsSection>

      {/* Spec Condenser Section */}
      <SettingsSection title="Spec Condenser" description="Agent and model for optimizing PRD for LLM consumption (reducing tokens)">
        {renderAgentFields(
          condenserAgent, setCondenserAgent,
          condenserModel, setCondenserModel,
          condenserReasoningEffort, setCondenserReasoningEffort,
          'condenser-models',
          condenserAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., haiku, sonnet'
        )}
      </SettingsSection>

      {/* Spec Generator Section */}
      <SettingsSection title="Spec Generator" description="Agent and model used to draft PRDs or technical specs">
        {renderAgentFields(
          specGenAgent, setSpecGenAgent,
          specGenModel, setSpecGenModel,
          specGenReasoningEffort, setSpecGenReasoningEffort,
          'specgen-models',
          specGenAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., sonnet, haiku'
        )}
      </SettingsSection>

      {/* Task Runner Section */}
      <SettingsSection title="Task Runner" description="Agent and model for executing user stories">
        <ConfigField label="Agent" description="Auto selects the first available agent. You can override per-run using --engine/--model flags.">
          <select
            className={selectClassName}
            value={taskRunnerAgent}
            onChange={(e) => setTaskRunnerAgent(e.target.value as 'auto' | CliType)}
            disabled={saving}
          >
            <option value="auto">Auto (detect first available)</option>
            {cliDetection?.claude.available && <option value="claude">Claude</option>}
            {cliDetection?.codex.available && <option value="codex">Codex</option>}
          </select>
        </ConfigField>

        <ConfigField label="Model" description="Optional model identifier. Leave empty for default.">
          <input
            type="text"
            className={inputClassName}
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
        </ConfigField>

        {taskRunnerAgent === 'codex' && (
          <ConfigField label="Reasoning Effort" description="Controls reasoning depth for Codex models. Higher = more thorough but slower.">
            <select
              className={selectClassName}
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
          </ConfigField>
        )}
      </SettingsSection>

      {/* Spec Chat Section */}
      <SettingsSection title="Spec Chat" description="Agent and model for interactive chat during spec review">
        {renderAgentFields(
          specChatAgent, setSpecChatAgent,
          specChatModel, setSpecChatModel,
          specChatReasoningEffort, setSpecChatReasoningEffort,
          'specchat-models',
          specChatAgent === 'codex' ? 'e.g., gpt-5, gpt-5-codex' : 'e.g., sonnet, opus'
        )}
      </SettingsSection>

      {/* CLI Status Display */}
      <SettingsSection title="CLI Availability" description="Detected CLI tools and their versions">
        <div className="bg-bg/60 border border-border rounded-xl overflow-hidden">
          {cliDetection && (
            <>
              {[
                { name: 'Codex', data: cliDetection.codex },
                { name: 'Claude', data: cliDetection.claude },
              ].map(({ name, data }) => (
                <div
                  key={name}
                  className={`flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0 ${
                    data.available ? '' : 'opacity-60'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                      data.available
                        ? 'bg-completed/15 text-completed'
                        : 'bg-blocked/15 text-blocked'
                    }`}
                  >
                    {data.available ? '✓' : '✗'}
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-text">{name}</span>
                  <span className={`text-[13px] font-mono ${data.available ? 'text-completed' : 'text-text-muted'}`}>
                    {data.available ? data.version : 'Not installed'}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </SettingsSection>

      {/* Execution Settings */}
      <SettingsSection title="Execution" description="Configure how tasks are executed">
        <ConfigField label="Prevent System Sleep" description="Prevents your computer from sleeping during long-running tasks. Recommended for overnight runs.">
          <div className="flex items-center gap-3">
            <label className="relative inline-block w-12 h-[26px] cursor-pointer">
              <input
                type="checkbox"
                checked={keepAwake}
                onChange={(e) => setKeepAwake(e.target.checked)}
                disabled={saving}
                className="opacity-0 w-0 h-0 peer"
              />
              <span className="absolute inset-0 bg-text-muted/40 border border-border rounded-full transition-all duration-300 peer-checked:bg-accent peer-checked:border-accent peer-focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] peer-disabled:opacity-40 peer-disabled:cursor-not-allowed before:content-[''] before:absolute before:h-[18px] before:w-[18px] before:left-[3px] before:bottom-[3px] before:bg-text before:rounded-full before:transition-all before:duration-300 before:shadow-md peer-checked:before:translate-x-[22px] peer-checked:before:bg-white" />
            </label>
            <span className="text-sm font-medium text-text">{keepAwake ? 'Enabled' : 'Disabled'}</span>
          </div>
        </ConfigField>
      </SettingsSection>

      <div className="flex items-center gap-4 pt-2">
        <button
          className="px-6 py-2.5 bg-gradient-to-br from-primary to-[#8b5cf6] border-none rounded-xl text-white text-sm font-semibold cursor-pointer transition-all duration-200 shadow-[0_2px_8px_rgba(163,113,247,0.25)] hover:from-primary-hover hover:to-primary hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(163,113,247,0.35)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
          onClick={handleSave}
          disabled={saving || availableClis.length === 0}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {saveSuccess && (
          <span className="text-sm text-completed font-medium">Settings saved successfully!</span>
        )}

        {saveError && (
          <span className="text-sm text-blocked font-medium">{saveError}</span>
        )}
      </div>
    </div>
  );
}
