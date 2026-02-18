import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type {
  CliType,
  ReasoningEffort
} from '../types.js';
import {
  Alert,
  Loading,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch
} from '../components/ui';
import { Button } from '../components/ui/Button';
import { useSettings, useCliDetection, useModelDetection, useUpdateSettings } from '@/features/settings';

/** Valid reasoning effort levels for Codex */
const REASONING_EFFORTS: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

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
function CliStatusCard({ cliDetection }: { cliDetection: any }) {
  if (!cliDetection) return null;

  return (
    <div className="rounded-lg bg-card border border-border shadow-sm">
      <div className="p-4">
        <h3 className="text-base font-semibold mb-2">CLI Status</h3>
        <div className="flex gap-4">
          {Object.entries(cliDetection).map(([key, data]: [string, any]) => (
            <div
              key={key}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted ${
                data?.available ? '' : 'opacity-50'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${data?.available ? 'bg-success' : 'bg-error'}`}
              />
              <span className="font-medium text-sm">
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
              <span className={`font-mono text-xs ${data?.available ? 'text-success' : 'text-muted-foreground'}`}>
                {data?.available ? `v${data.version}` : 'N/A'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsView() {
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useSettings();
  const { data: cliDetection, isLoading: cliLoading } = useCliDetection();
  const { data: modelDetection, isLoading: modelsLoading } = useModelDetection();
  const updateSettingsMutation = useUpdateSettings();

  // Local state for form fields
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
  const [taskRunnerAgent, setTaskRunnerAgent] = useState<CliType | 'auto'>('auto');
  const [taskRunnerModel, setTaskRunnerModel] = useState<string>('');
  const [taskRunnerReasoningEffort, setTaskRunnerReasoningEffort] = useState<ReasoningEffort>('medium');

  // Spec chat settings
  const [specChatAgent, setSpecChatAgent] = useState<CliType>('claude');
  const [specChatModel, setSpecChatModel] = useState<string>('');
  const [specChatReasoningEffort, setSpecChatReasoningEffort] = useState<ReasoningEffort>('medium');

  // Execution settings
  const [keepAwake, setKeepAwake] = useState<boolean>(true);
  const [parallelEnabled, setParallelEnabled] = useState<boolean>(false);
  const [maxParallel, setMaxParallel] = useState<number>(2);

  // Initialize form state when settings are loaded
  useEffect(() => {
    if (settings) {
      setDecomposeAgent(settings.decompose.reviewer.agent);
      setDecomposeModel(settings.decompose.reviewer.model || '');
      setDecomposeReasoningEffort(settings.decompose.reviewer.reasoningEffort || 'medium');
      setCondenserAgent(settings.condenser.agent);
      setCondenserModel(settings.condenser.model || '');
      setCondenserReasoningEffort(settings.condenser.reasoningEffort || 'medium');
      setSpecGenAgent(settings.specGenerator.agent);
      setSpecGenModel(settings.specGenerator.model || '');
      setSpecGenReasoningEffort(settings.specGenerator.reasoningEffort || 'medium');
      setTaskRunnerAgent(settings.taskRunner.agent);
      setTaskRunnerModel(settings.taskRunner.model || '');
      setTaskRunnerReasoningEffort(settings.taskRunner.reasoningEffort || 'medium');
      setSpecChatAgent(settings.specChat?.agent || 'claude');
      setSpecChatModel(settings.specChat?.model || '');
      setSpecChatReasoningEffort(settings.specChat?.reasoningEffort || 'medium');
      setKeepAwake(settings.execution?.keepAwake ?? true);
      setParallelEnabled(settings.execution?.parallel?.enabled ?? false);
      setMaxParallel(settings.execution?.parallel?.maxParallel ?? 2);
    }
  }, [settings]);

  const handleSave = async () => {
    updateSettingsMutation.mutate({
      decompose: {
        reviewer: {
          agent: decomposeAgent,
          model: decomposeModel,
          reasoningEffort: decomposeAgent === 'codex' ? decomposeReasoningEffort : undefined,
        },
      },
      condenser: {
        agent: condenserAgent,
        model: condenserModel,
        reasoningEffort: condenserAgent === 'codex' ? condenserReasoningEffort : undefined,
      },
      specGenerator: {
        agent: specGenAgent,
        model: specGenModel,
        reasoningEffort: specGenAgent === 'codex' ? specGenReasoningEffort : undefined,
      },
      taskRunner: {
        agent: taskRunnerAgent,
        model: taskRunnerModel,
        reasoningEffort: taskRunnerAgent === 'codex' ? taskRunnerReasoningEffort : undefined,
      },
      specChat: {
        agent: specChatAgent,
        model: specChatModel,
        reasoningEffort: specChatAgent === 'codex' ? specChatReasoningEffort : undefined,
      },
      execution: {
        keepAwake,
        parallel: { enabled: parallelEnabled, maxParallel },
      },
    }, {
      onSuccess: () => {
        toast.success('Settings saved successfully');
      },
      onError: (err: any) => {
        toast.error(err.message || 'Failed to save settings');
      }
    });
  };

  const getAvailableClis = (): CliType[] => {
    if (!cliDetection) return [];
    return (Object.keys(cliDetection) as CliType[]).filter(
      (key) => cliDetection[key]?.available
    );
  };

  const availableClis = getAvailableClis();
  const saving = updateSettingsMutation.isPending;

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
              onValueChange={(v) => {
                setAgent(v as CliType);
                // Reset model when switching agents to avoid stale cross-agent model IDs.
                setModel('');
              }}
              disabled={availableClis.length === 0 || saving || cliLoading}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue placeholder={cliLoading ? "Detecting agents..." : "Select agent"} />
              </SelectTrigger>
              <SelectContent>
                {cliLoading ? (
                  <SelectItem value="loading" disabled>Detecting agents...</SelectItem>
                ) : availableClis.length === 0 ? (
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
              disabled={saving || modelsLoading}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue placeholder={modelsLoading ? "Detecting models..." : placeholder} />
              </SelectTrigger>
              <SelectContent>
                {modelsLoading ? (
                  <SelectItem value="loading" disabled>Detecting models...</SelectItem>
                ) : (
                  <>
                    <SelectItem value="__default__">{placeholder}</SelectItem>
                    {modelDetection && modelDetection[agentValue]?.models.map((model: string) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </>
                )}
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

  if ((settingsLoading && !settings) || (cliLoading && !cliDetection) || (modelsLoading && !modelDetection)) {
    return (
      <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full min-h-0">
        <div className="flex items-center justify-center min-h-[200px]">
          <Loading size="lg" />
        </div>
      </div>
    );
  }

  const error = settingsError ? (settingsError as Error).message : null;

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
                              onValueChange={(v) => {
                                setTaskRunnerAgent(v as 'auto' | CliType);
                                // Reset model when switching agents to avoid stale cross-agent model IDs.
                                setTaskRunnerModel('');
                              }}
                              disabled={saving}
                            >
                              <SelectTrigger className="w-full h-8 text-sm">
                                <SelectValue placeholder="Select agent" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Auto (detect first available)</SelectItem>
                                {availableClis.map((cli) => (
                                  <SelectItem key={cli} value={cli}>
                                    {cli.charAt(0).toUpperCase() + cli.slice(1)}
                                  </SelectItem>
                                ))}
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
                                {modelDetection && taskRunnerAgent !== 'auto' && (modelDetection as any)[taskRunnerAgent]?.models.map((model: string) => (
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

              <ConfigField label="Parallel Execution" description="Run multiple tasks simultaneously">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={parallelEnabled}
                    onCheckedChange={(checked) => setParallelEnabled(checked)}
                    disabled={saving}
                  />
                  <span className="text-sm font-medium">{parallelEnabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </ConfigField>

              {parallelEnabled && (
                <ConfigField label="Max Parallel Tasks" description="Number of tasks to run concurrently (1-8)">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="8"
                      value={maxParallel}
                      onChange={(e) => setMaxParallel(parseInt(e.target.value, 10))}
                      disabled={saving}
                      className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm font-medium w-8">{maxParallel}</span>
                  </div>
                </ConfigField>
              )}
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
