import { useState, useEffect, useCallback } from 'react';
import './SettingsView.css';

interface CliDetectionResult {
  available: boolean;
  version: string;
  command: string;
}

interface AllCliDetectionResults {
  codex: CliDetectionResult;
  claude: CliDetectionResult;
}

interface GlobalSettings {
  reviewer: {
    cli: 'codex' | 'claude';
  };
}

type CliType = 'codex' | 'claude';

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
  const [_settings, setSettings] = useState<GlobalSettings | null>(null);
  const [selectedCli, setSelectedCli] = useState<CliType>('codex');

  // _settings is intentionally unused - we track selectedCli locally but persist via setSettings
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

      const [detection, currentSettings] = await Promise.all([
        fetchCliDetection(),
        fetchSettings()
      ]);

      setCliDetection(detection);
      setSettings(currentSettings);

      if (currentSettings?.reviewer?.cli) {
        setSelectedCli(currentSettings.reviewer.cli);
      }

      // Check if no CLIs are available
      if (detection && !detection.codex.available && !detection.claude.available) {
        setError('No CLI tools are available. Please install Codex or Claude CLI.');
      }

      setLoading(false);
    };

    loadData();
  }, [fetchCliDetection, fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: { cli: selectedCli } })
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

  // Check if currently selected CLI is unavailable
  const isSelectedCliUnavailable = (): boolean => {
    if (!cliDetection) return false;
    const detection = cliDetection[selectedCli];
    return !detection.available;
  };

  const selectedCliUnavailable = isSelectedCliUnavailable();

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
        <p>Configure global Qala settings</p>
      </div>

      {error && (
        <div className="settings-error-banner">
          <span className="error-icon">&#9888;</span>
          {error}
        </div>
      )}

      <div className="settings-section">
        <div className="section-header">
          <h3>Decomposition Reviewer</h3>
          <p>Select which CLI tool to use for peer review during PRD decomposition</p>
        </div>

        <div className="section-content">
          <div className="config-field">
            <label>Reviewer CLI</label>
            <div className="select-wrapper">
              <select
                value={selectedCli}
                onChange={(e) => setSelectedCli(e.target.value as CliType)}
                disabled={availableClis.length === 0 || saving}
                className={selectedCliUnavailable ? 'has-warning' : ''}
              >
                {availableClis.length === 0 ? (
                  <option value="">No CLIs available</option>
                ) : (
                  <>
                    {/* Include unavailable selected CLI so user can see current selection */}
                    {selectedCliUnavailable && (
                      <option value={selectedCli}>
                        {selectedCli.charAt(0).toUpperCase() + selectedCli.slice(1)} (unavailable)
                      </option>
                    )}
                    {availableClis.map((cli) => (
                      <option key={cli} value={cli}>
                        {cli.charAt(0).toUpperCase() + cli.slice(1)}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {selectedCliUnavailable && (
                <span className="select-warning-indicator" title="Selected CLI is unavailable">⚠</span>
              )}
            </div>
            {selectedCliUnavailable && (
              <div className="cli-warning-message">
                The selected CLI ({selectedCli.charAt(0).toUpperCase() + selectedCli.slice(1)}) is currently unavailable.
                Please select a different CLI or reinstall the missing tool.
              </div>
            )}
          </div>

          <div className="cli-status-list">
            <div className="status-list-header">CLI Availability</div>
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
      </div>
    </div>
  );
}
