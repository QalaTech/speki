import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  AllCliDetectionResults,
  AllModelDetectionResults,
  GlobalSettings,
  CliType,
  ReasoningEffort
} from '../types.js';
import {
  Alert,
  Loading,
  apiFetch,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch
} from '../components/ui';
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
                ...(cliDetection.gemini ? [{ name: 'Gemini', data: cliDetection.gemini }] : []),
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

      if (detection && !detection.codex?.available && !detection.claude?.available && !detection.gemini?.available) {
        setError('No CLI tools are available. Please install Codex, Claude, or Gemini CLI.');
      }

      setLoading(false);
    };

    loadData();
  }, [fetchCliDetection, fetchModelDetection, fetchSettings]);

  const handleSave = async () => {
    setSaving(true);

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
      toast.success('Settings saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getAvailableClis = (): CliType[] => {
    if (!cliDetection) return [];
    const available: CliType[] = [];
    if (cliDetection.codex?.available) available.push('codex');
    if (cliDetection.claude?.available) available.push('claude');
    if (cliDetection.gemini?.available) available.push('gemini');
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
      <div className="flex gap-3">
        <div className="flex-1">
          <ConfigField label="Agent">
            <SelectRoot
              value={agentValue}
              onValueChange={(v) => setAgent(v as CliType)}
              disabled={availableClis.length === 0 || saving}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {availableClis.length === 0 ? (
                  <SelectItem value="none" disabled>No agents available</SelectItem>
                ) : (
                  availableClis.map((cli) => (
                    <SelectItem key={cli} value={cli}>
                      {cli.charAt(0).toUpperCase() + cli.slice(1)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </SelectRoot>
          </ConfigField>
        </div>

        <div className="flex-1">
          <ConfigField label="Model">
            <SelectRoot
              value={modelValue || "__default__"}
              onValueChange={(v) => setModel(v === "__default__" ? "" : v)}
              disabled={saving}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">{placeholder}</SelectItem>
                {modelDetection && modelDetection[agentValue]?.models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </ConfigField>
        </div>
      </div>

      {agentValue === 'codex' && (
        <ConfigField label="Reasoning Effort">
          <SelectRoot
            value={reasoningValue}
            onValueChange={(v) => setReasoning(v as ReasoningEffort)}
            disabled={saving}
          >
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue placeholder="Select reasoning effort" />
            </SelectTrigger>
            <SelectContent>
              {REASONING_EFFORTS.map((effort) => (
                <SelectItem key={effort} value={effort}>
                  {effort.charAt(0).toUpperCase() + effort.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectRoot>
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
    <div className="flex flex-col h-full min-h-0">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 pb-24">
        <div className="flex flex-col gap-4 max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
            <div>
              <h2 className="m-0 mb-1 text-2xl font-semibold">Settings</h2>
              <p className="m-0 text-sm text-muted-foreground">Configure agents and models for different tasks</p>
            </div>
            <CliStatusCard cliDetection={cliDetection} />
          </div>

          {error && (
            <Alert variant="warning">{error}</Alert>
          )}

          {/* Apply to All */}
          {availableClis.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <span className="text-sm font-medium whitespace-nowrap">Set all agents to:</span>
              <div className="w-[180px]">
                <SelectRoot
                  onValueChange={(v) => {
                    const cli = v as CliType;
                    setSpecChatAgent(cli);
                    setDecomposeAgent(cli);
                    setSpecGenAgent(cli);
                    setCondenserAgent(cli);
                    setTaskRunnerAgent(cli);
                    // Clear models since they're not cross-compatible
                    setSpecChatModel('');
                    setDecomposeModel('');
                    setSpecGenModel('');
                    setCondenserModel('');
                    setTaskRunnerModel('');
                  }}
                  disabled={saving}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClis.map((cli) => (
                      <SelectItem key={cli} value={cli}>
                        {cli.charAt(0).toUpperCase() + cli.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
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
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <ConfigField label="Agent">
                            <SelectRoot
                              value={taskRunnerAgent}
                              onValueChange={(v) => setTaskRunnerAgent(v as 'auto' | CliType)}
                              disabled={saving}
                            >
                              <SelectTrigger className="w-full h-8 text-sm">
                                <SelectValue placeholder="Select agent" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Auto (detect first available)</SelectItem>
                                {cliDetection?.claude.available && <SelectItem value="claude">Claude</SelectItem>}
                                {cliDetection?.codex.available && <SelectItem value="codex">Codex</SelectItem>}
                                {cliDetection?.gemini?.available && <SelectItem value="gemini">Gemini</SelectItem>}
                              </SelectContent>
                            </SelectRoot>
                          </ConfigField>
                        </div>
            
                        <div className="flex-1">
                          <ConfigField label="Model">
                            <SelectRoot
                              value={taskRunnerModel || "__default__"}
                              onValueChange={(v) => setTaskRunnerModel(v === "__default__" ? "" : v)}
                              disabled={saving || taskRunnerAgent === 'auto'}
                            >
                              <SelectTrigger className="w-full h-8 text-sm">
                                <SelectValue placeholder="Default (auto-select)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Default (auto-select)</SelectItem>
                                {modelDetection && taskRunnerAgent !== 'auto' && modelDetection[taskRunnerAgent as CliType]?.models.map((model) => (
                                  <SelectItem key={model} value={model}>
                                    {model}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </SelectRoot>
                          </ConfigField>
                        </div>
                      </div>
            
                      {taskRunnerAgent === 'codex' && (
                        <ConfigField label="Reasoning Effort">
                          <SelectRoot
                            value={taskRunnerReasoningEffort}
                            onValueChange={(v) => setTaskRunnerReasoningEffort(v as ReasoningEffort)}
                            disabled={saving}
                          >
                            <SelectTrigger className="w-full h-8 text-sm">
                              <SelectValue placeholder="Select reasoning effort" />
                            </SelectTrigger>
                            <SelectContent>
                              {REASONING_EFFORTS.map((effort) => (
                                <SelectItem key={effort} value={effort}>
                                  {effort.charAt(0).toUpperCase() + effort.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </SelectRoot>
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
                  <Switch
                    checked={keepAwake}
                    onCheckedChange={(checked) => setKeepAwake(checked)}
                    disabled={saving}
                  />
                  <span className="text-sm font-medium">{keepAwake ? 'Enabled' : 'Disabled'}</span>
                </div>
              </ConfigField>
            </SettingsSection>
          </div>
        </div>
      </div>

      {/* Sticky Footer for Save Action */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border flex justify-end px-8">
        <div className="max-w-5xl w-full mx-auto flex justify-end">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || availableClis.length === 0}
            isLoading={saving}
            className="shadow-sm shadow-primary/20 px-12"
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
