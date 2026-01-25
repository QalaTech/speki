import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  trackChange,
  revertChange,
  revertAll,
} from '../change-tracker.js';
import type { SessionFile, ChangeHistoryEntry } from '../../../types/index.js';

function createMockSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    sessionId: 'test-session-id',
    specFilePath: '/path/to/spec.md',
    status: 'in_progress',
    startedAt: '2026-01-10T10:00:00Z',
    lastUpdatedAt: '2026-01-10T11:00:00Z',
    suggestions: [],
    changeHistory: [],
    chatMessages: [],
    ...overrides,
  };
}

function createMockChange(overrides: Partial<ChangeHistoryEntry> = {}): ChangeHistoryEntry {
  return {
    id: 'change-001',
    timestamp: '2026-01-10T12:00:00Z',
    description: 'Updated requirements section',
    filePath: '/path/to/spec.md',
    beforeContent: 'Original content',
    afterContent: 'New content',
    reverted: false,
    ...overrides,
  };
}

describe('change-tracker', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `change-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('trackChange_AddsToHistory', async () => {
    const session = createMockSession({
      specFilePath: join(testDir, 'specs', 'test-spec.md'),
    });

    const change = createMockChange({
      id: 'change-track-001',
      filePath: join(testDir, 'specs', 'test-spec.md'),
    });

    const updatedSession = await trackChange(session, change);

    expect(updatedSession.changeHistory).toHaveLength(1);
    expect(updatedSession.changeHistory[0]).toEqual(change);
    expect(updatedSession.lastUpdatedAt).not.toBe(session.lastUpdatedAt);
  });

  it('revertChange_RestoresContent', async () => {
    const specFilePath = join(testDir, 'specs', 'revert-spec.md');
    await mkdir(join(testDir, 'specs'), { recursive: true });
    await writeFile(specFilePath, 'New content after change', 'utf-8');

    const change = createMockChange({
      id: 'change-revert-001',
      filePath: specFilePath,
      beforeContent: 'Original content before change',
      afterContent: 'New content after change',
      reverted: false,
    });

    const session = createMockSession({
      specFilePath,
      changeHistory: [change],
    });

    const result = await revertChange(session, 'change-revert-001');

    expect(result.success).toBe(true);
    expect(result.change.reverted).toBe(true);

    const restoredContent = await readFile(specFilePath, 'utf-8');
    expect(restoredContent).toBe('Original content before change');
  });

  it('revertAll_RestoresOriginal', async () => {
    const specFilePath = join(testDir, 'specs', 'revert-all-spec.md');
    await mkdir(join(testDir, 'specs'), { recursive: true });
    await writeFile(specFilePath, 'Content after 3 changes', 'utf-8');

    const changes: ChangeHistoryEntry[] = [
      createMockChange({
        id: 'change-001',
        filePath: specFilePath,
        beforeContent: 'Original spec content',
        afterContent: 'Content after first change',
        timestamp: '2026-01-10T12:00:00Z',
      }),
      createMockChange({
        id: 'change-002',
        filePath: specFilePath,
        beforeContent: 'Content after first change',
        afterContent: 'Content after second change',
        timestamp: '2026-01-10T12:01:00Z',
      }),
      createMockChange({
        id: 'change-003',
        filePath: specFilePath,
        beforeContent: 'Content after second change',
        afterContent: 'Content after 3 changes',
        timestamp: '2026-01-10T12:02:00Z',
      }),
    ];

    const session = createMockSession({
      specFilePath,
      changeHistory: changes,
    });

    const result = await revertAll(session);

    expect(result.success).toBe(true);
    expect(result.revertedCount).toBe(3);
    expect(result.changes).toHaveLength(3);
    result.changes.forEach((c) => expect(c.reverted).toBe(true));

    const restoredContent = await readFile(specFilePath, 'utf-8');
    expect(restoredContent).toBe('Original spec content');
  });

  it('trackChange_PersistsToSession', async () => {
    const specFilePath = join(testDir, 'specs', 'persist-spec.md');
    const session = createMockSession({
      specFilePath,
    });

    const change = createMockChange({
      id: 'change-persist-001',
      filePath: specFilePath,
    });

    await trackChange(session, change);

    const sessionPath = join(testDir, '.speki', 'sessions', 'persist-spec.session.json');
    const savedContent = await readFile(sessionPath, 'utf-8');
    const savedSession = JSON.parse(savedContent) as SessionFile;

    expect(savedSession.changeHistory).toHaveLength(1);
    expect(savedSession.changeHistory[0].id).toBe('change-persist-001');
  });
});
