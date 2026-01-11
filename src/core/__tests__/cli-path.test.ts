import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';

import { checkCliAvailable, getInstallInstructions, isCliAvailable, clearCliPathCache } from '../cli-path.js';

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    existsSync: vi.fn(),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return {
    ...original,
    execFileSync: vi.fn(),
  };
});

describe('checkCliAvailable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearCliPathCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checkCliAvailable_ReturnsTrue_WhenInstalled', () => {
    // Mock CLI found via which command
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/claude\n');
    vi.mocked(existsSync).mockReturnValue(true);

    const result = checkCliAvailable('claude');

    expect(result.available).toBe(true);
    expect(result.cli).toBe('claude');
    expect(result.error).toBeUndefined();
    expect(result.installInstructions).toBeUndefined();
  });

  it('checkCliAvailable_ReturnsFalse_WhenMissing', () => {
    // Mock CLI not found
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('which: claude not found');
    });
    vi.mocked(existsSync).mockReturnValue(false);

    const result = checkCliAvailable('claude');

    expect(result.available).toBe(false);
    expect(result.cli).toBe('claude');
    expect(result.error).toBe('claude CLI is not installed or not in PATH');
    expect(result.installInstructions).toBeDefined();
    expect(result.installInstructions).toContain('npm install');
    expect(result.installInstructions).toContain('anthropic');
  });

  it('checkCliAvailable_ReturnsFalse_WhenCodexMissing', () => {
    // Mock CLI not found
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('which: codex not found');
    });
    vi.mocked(existsSync).mockReturnValue(false);

    const result = checkCliAvailable('codex');

    expect(result.available).toBe(false);
    expect(result.cli).toBe('codex');
    expect(result.error).toBe('codex CLI is not installed or not in PATH');
    expect(result.installInstructions).toBeDefined();
    expect(result.installInstructions).toContain('npm install');
    expect(result.installInstructions).toContain('openai');
  });
});

describe('getInstallInstructions', () => {
  it('getInstallInstructions_ForClaude_ReturnsAnthropicDocs', () => {
    const instructions = getInstallInstructions('claude');

    expect(instructions).toContain('npm install');
    expect(instructions).toContain('@anthropic-ai/claude-cli');
    expect(instructions).toContain('anthropic.com');
  });

  it('getInstallInstructions_ForCodex_ReturnsOpenAIDocs', () => {
    const instructions = getInstallInstructions('codex');

    expect(instructions).toContain('npm install');
    expect(instructions).toContain('@openai/codex');
    expect(instructions).toContain('github.com/openai');
  });
});
