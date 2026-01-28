import { useState, useEffect, useCallback } from 'react';
import type {
  AllCliDetectionResults,
  AllModelDetectionResults,
  GlobalSettings,
  CliType,
  ReasoningEffort
} from '../types.js';
import { Alert, Loading, apiFetch } from '../components/ui';
import { Button } from '../components/ui/Button';

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

// Reusable form field component - compact style
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
    <div className="flex flex-col gap-1 w-full">
      <label className="flex py-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
      </label>
      {children}
      {description && (
        <label className="flex py-0.5">
          <span className="text-xs text-muted-foreground">{description}</span>
        </label>
      )}
    </div>
  );
}

// Reusable section component - compact tile style
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
    <div className="rounded-lg bg-card border border-border shadow-sm">
      <div className="p-4">
        <h3 className="text-base font-semibold mb-0">{title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

// CLI Status card component
function CliStatusCard({ cliDetection }: { cliDetection: AllCliDetectionResults | null }) {
  return (
    <div className="rounded-lg bg-card border border-border shadow-sm">
      <div className="p-4">
        <h3 className="text-base font-semibold mb-2">CLI Status</h3>
        <div className="flex gap-4">
          {cliDetection && (
            <>
              {[
                { name: 'Claude', data: cliDetection.claude },
                { name: 'Codex', data: cliDetection.codex },
              ].map(({ name, data }) => (
                <div
                  key={name}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted ${
                    data.available ? '' : 'opacity-50'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${data.available ? 'bg-success' : 'bg-error'}`}
                  />
                  <span className="font-medium text-sm">{name}</span>
                  <span className={`font-mono text-xs ${data.available ? 'text-success' : 'text-muted-foreground'}`}>
                    {data.available ? `v${data.version}` : 'N/A'}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
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
    const cached = getCachedCliDetection();
    if (cached) return cached;

    try {
      const res = await apiFetch('/api/settings/cli/detect');
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
      const res = await apiFetch('/api/settings/models/detect');
      if (!res.ok) throw new Error('Failed to fetch model detection');
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch model detection:', err);
      return null;
    }
  }, []);

  const fetchSettings = useCallback(async (): Promise<GlobalSettings | null> => {
    try {
      const res = await apiFetch('/api/settings');
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
      const res = await apiFetch('/api/settings', {
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
    placeholder: string
  ) => (
    <>
      <ConfigField label="Agent">
        <select
          className="select select-bordered select-sm w-full"
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

      <ConfigField label="Model">
        <select
          className="select select-bordered select-sm w-full"
          value={modelValue}
          onChange={(e) => setModel(e.target.value)}
          disabled={saving}
        >
          <option value="">{placeholder}</option>
          {modelDetection && modelDetection[agentValue]?.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </ConfigField>

      {agentValue === 'codex' && (
        <ConfigField label="Reasoning Effort">
          <select
            className="select select-bordered select-sm w-full"
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
          <Loading size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 overflow-y-auto h-full min-h-0">
      {/* Header with CLI Status and Save Button */}
      <div className="flex flex-col gap-4 mb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="m-0 mb-1 text-2xl font-semibold">Settings</h2>
            <p className="m-0 text-sm text-muted-foreground">Configure agents and models for different tasks</p>
          </div>
          <div className="flex items-center gap-3">
            <CliStatusCard cliDetection={cliDetection} />
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || availableClis.length === 0}
              isLoading={saving}
              className="shadow-sm shadow-primary/20 px-8"
            >
              Save
            </Button>
          </div>
        </div>
        {(saveSuccess || saveError) && (
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-sm text-success font-medium">Settings saved!</span>
            )}
            {saveError && (
              <span className="text-sm text-error font-medium">{saveError}</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <Alert variant="warning">{error}</Alert>
      )}

      {/* Settings Grid - 2 columns on larger screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Spec Chat Section - Most used, first */}
        <SettingsSection title="Spec Chat" description="Interactive chat during spec review">
          {renderAgentFields(
            specChatAgent, setSpecChatAgent,
            specChatModel, setSpecChatModel,
            specChatReasoningEffort, setSpecChatReasoningEffort,
            'Default (auto-select)'
          )}
        </SettingsSection>

        {/* Task Runner Section */}
        <SettingsSection title="Task Runner" description="Agent for executing user stories">
          <ConfigField label="Agent">
            <select
              className="select select-bordered select-sm w-full"
              value={taskRunnerAgent}
              onChange={(e) => setTaskRunnerAgent(e.target.value as 'auto' | CliType)}
              disabled={saving}
            >
              <option value="auto">Auto (detect first available)</option>
              {cliDetection?.claude.available && <option value="claude">Claude</option>}
              {cliDetection?.codex.available && <option value="codex">Codex</option>}
            </select>
          </ConfigField>

          <ConfigField label="Model">
            <select
              className="select select-bordered select-sm w-full"
              value={taskRunnerModel}
              onChange={(e) => setTaskRunnerModel(e.target.value)}
              disabled={saving || taskRunnerAgent === 'auto'}
            >
              <option value="">Default (auto-select)</option>
              {modelDetection && taskRunnerAgent !== 'auto' && modelDetection[taskRunnerAgent as CliType]?.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </ConfigField>

          {taskRunnerAgent === 'codex' && (
            <ConfigField label="Reasoning Effort">
              <select
                className="select select-bordered select-sm w-full"
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

        {/* Decompose Reviewer Section */}
        <SettingsSection title="Decompose Reviewer" description="Peer review during PRD decomposition">
          {renderAgentFields(
            decomposeAgent, setDecomposeAgent,
            decomposeModel, setDecomposeModel,
            decomposeReasoningEffort, setDecomposeReasoningEffort,
            'Default (auto-select)'
          )}
        </SettingsSection>

        {/* Spec Generator Section */}
        <SettingsSection title="Spec Generator" description="Draft PRDs or technical specs">
          {renderAgentFields(
            specGenAgent, setSpecGenAgent,
            specGenModel, setSpecGenModel,
            specGenReasoningEffort, setSpecGenReasoningEffort,
            'Default (auto-select)'
          )}
        </SettingsSection>

        {/* Spec Condenser Section */}
        <SettingsSection title="Spec Condenser" description="Optimize PRD for LLM consumption">
          {renderAgentFields(
            condenserAgent, setCondenserAgent,
            condenserModel, setCondenserModel,
            condenserReasoningEffort, setCondenserReasoningEffort,
            'Default (auto-select)'
          )}
        </SettingsSection>

        {/* Execution Settings */}
        <SettingsSection title="Execution" description="Task execution behavior">
          <ConfigField label="Prevent System Sleep" description="Keep system awake during long tasks">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={keepAwake}
                onChange={(e) => setKeepAwake(e.target.checked)}
                disabled={saving}
              />
              <span className="text-sm">{keepAwake ? 'Enabled' : 'Disabled'}</span>
            </div>
          </ConfigField>
        </SettingsSection>
      </div>

    </div>
  );
}
