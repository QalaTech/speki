import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listSpecs,
  loadPRDForSpec,
  readSpecMetadata,
  updateSpecStatus,
  writeSpecMetadata,
} from '@speki/core';
import type { PRDData, SpecMetadata } from '@speki/core';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}));

function createMockPRD(overrides: Partial<PRDData> = {}): PRDData {
  return {
    projectName: 'Test Project',
    branchName: 'main',
    language: 'typescript',
    standardsFile: '.speki/standards/typescript.md',
    description: 'Test project description',
    userStories: [
      {
        id: 'US-001',
        title: 'Test Story 1',
        description: 'Description 1',
        acceptanceCriteria: ['AC1'],
        testCases: [],
        priority: 1,
        passes: false,
        notes: '',
        dependencies: [],
        complexity: 'low' as const,
      },
    ],
    ...overrides,
  };
}

function createMockMetadata(overrides: Partial<SpecMetadata> = {}): SpecMetadata {
  return {
    created: '2026-01-10T10:00:00Z',
    lastModified: '2026-01-10T12:00:00Z',
    status: 'decomposed',
    specPath: 'specs/test.md',
    ...overrides,
  };
}

function setupSpecDir(tempDir: string, specId: string): string {
  const specDir = join(tempDir, '.speki', 'specs', specId);
  mkdirSync(specDir, { recursive: true });
  return specDir;
}

describe('start command spec-partitioned state', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'start-test-'));
    mkdirSync(join(tempDir, '.speki'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it('start_WithSpecFlag_ReadsFromSpecDir', async () => {
    const specId = 'my-feature';
    const specDir = setupSpecDir(tempDir, specId);

    writeFileSync(
      join(specDir, 'tasks.json'),
      JSON.stringify(createMockPRD({ projectName: 'My Feature Project' }), null, 2)
    );
    writeFileSync(
      join(specDir, 'metadata.json'),
      JSON.stringify(createMockMetadata({ status: 'decomposed' }), null, 2)
    );

    const loadedPrd = await loadPRDForSpec(tempDir, specId);

    expect(loadedPrd).not.toBeNull();
    expect(loadedPrd?.projectName).toBe('My Feature Project');
    expect(loadedPrd?.userStories).toHaveLength(1);
  });

  it('start_TransitionsStatusToActive', async () => {
    const specId = 'feature-to-activate';
    const specDir = setupSpecDir(tempDir, specId);

    writeFileSync(
      join(specDir, 'metadata.json'),
      JSON.stringify(createMockMetadata({ status: 'decomposed' }), null, 2)
    );
    writeFileSync(
      join(specDir, 'tasks.json'),
      JSON.stringify(createMockPRD(), null, 2)
    );

    const initialMetadata = await readSpecMetadata(tempDir, specId);
    expect(initialMetadata?.status).toBe('decomposed');

    await updateSpecStatus(tempDir, specId, 'active');

    const updatedMetadata = await readSpecMetadata(tempDir, specId);
    expect(updatedMetadata?.status).toBe('active');
  });

  it('start_UpdatesTaskProgressInSpecDir', async () => {
    const specId = 'progress-spec';
    const specDir = setupSpecDir(tempDir, specId);

    const prd = createMockPRD({
      userStories: [
        {
          id: 'US-001',
          title: 'Task 1',
          description: 'Description 1',
          acceptanceCriteria: ['AC1'],
          testCases: [],
          priority: 1,
          passes: false,
          notes: '',
          dependencies: [],
          complexity: 'low' as const,
        },
        {
          id: 'US-002',
          title: 'Task 2',
          description: 'Description 2',
          acceptanceCriteria: ['AC2'],
          testCases: [],
          priority: 2,
          passes: false,
          notes: '',
          dependencies: ['US-001'],
          complexity: 'low' as const,
        },
      ],
    });
    writeFileSync(join(specDir, 'tasks.json'), JSON.stringify(prd, null, 2));
    writeFileSync(
      join(specDir, 'metadata.json'),
      JSON.stringify(createMockMetadata({ status: 'active' }), null, 2)
    );

    const loadedPrd = await loadPRDForSpec(tempDir, specId);
    expect(loadedPrd).not.toBeNull();
    expect(loadedPrd?.userStories.filter((s) => !s.passes)).toHaveLength(2);

    if (loadedPrd) {
      loadedPrd.userStories[0].passes = true;
      loadedPrd.userStories[0].executedAt = new Date().toISOString();
      writeFileSync(join(specDir, 'tasks.json'), JSON.stringify(loadedPrd, null, 2));
    }

    const reloadedPrd = await loadPRDForSpec(tempDir, specId);
    expect(reloadedPrd?.userStories[0].passes).toBe(true);
    expect(reloadedPrd?.userStories[0].executedAt).toBeDefined();
    expect(reloadedPrd?.userStories.filter((s) => !s.passes)).toHaveLength(1);
  });

  it('start_WithNoDecomposedSpecs_ShowsError', async () => {
    const specId = 'draft-spec';
    const specDir = setupSpecDir(tempDir, specId);

    writeFileSync(
      join(specDir, 'metadata.json'),
      JSON.stringify(createMockMetadata({ status: 'draft' }), null, 2)
    );

    const specs = await listSpecs(tempDir);
    expect(specs).toHaveLength(1);

    const prd = await loadPRDForSpec(tempDir, specId);
    expect(prd).toBeNull();

    const loadedMetadata = await readSpecMetadata(tempDir, specId);
    expect(loadedMetadata?.status).toBe('draft');
  });
});

describe('start command status transitions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'start-status-test-'));
    mkdirSync(join(tempDir, '.speki'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('start_TransitionFromDecomposed_Succeeds', async () => {
    const specId = 'decomposed-spec';
    setupSpecDir(tempDir, specId);

    await writeSpecMetadata(tempDir, specId, createMockMetadata({ status: 'decomposed' }));
    await updateSpecStatus(tempDir, specId, 'active');

    const metadata = await readSpecMetadata(tempDir, specId);
    expect(metadata?.status).toBe('active');
  });

  it('start_TransitionFromActive_Fails', async () => {
    const specId = 'active-spec';
    setupSpecDir(tempDir, specId);

    await writeSpecMetadata(tempDir, specId, createMockMetadata({ status: 'active' }));

    await expect(updateSpecStatus(tempDir, specId, 'active')).rejects.toThrow(
      'Invalid status transition'
    );
  });

  it('start_TransitionFromDraft_Fails', async () => {
    const specId = 'draft-spec';
    setupSpecDir(tempDir, specId);

    await writeSpecMetadata(tempDir, specId, createMockMetadata({ status: 'draft' }));

    await expect(updateSpecStatus(tempDir, specId, 'active')).rejects.toThrow(
      'Invalid status transition'
    );
  });
});
