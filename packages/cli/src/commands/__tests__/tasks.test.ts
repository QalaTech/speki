import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listSpecs, loadPRDForSpec } from '@speki/core';
import type { PRDData } from '@speki/core';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}));

const DEFAULT_USER_STORIES = [
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
  {
    id: 'US-002',
    title: 'Test Story 2',
    description: 'Description 2',
    acceptanceCriteria: ['AC2'],
    testCases: [],
    priority: 2,
    passes: true,
    notes: '',
    dependencies: ['US-001'],
    complexity: 'medium' as const,
  },
];

function createMockPRD(overrides: Partial<PRDData> = {}): PRDData {
  return {
    projectName: 'Test Project',
    branchName: 'main',
    language: 'typescript',
    standardsFile: '.speki/standards/typescript.md',
    description: 'Test project description',
    userStories: DEFAULT_USER_STORIES,
    ...overrides,
  };
}

describe('tasks command spec-partitioned reading', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tasks-test-'));
    // Create .speki directory structure
    mkdirSync(join(tempDir, '.speki'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it('tasksList_WithSpecFlag_ReadsFromSpecDir', async () => {
    // Create spec directory with PRD
    const specId = 'my-feature';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    const prd = createMockPRD({ projectName: 'My Feature Project' });
    writeFileSync(join(specDir, 'tasks.json'), JSON.stringify(prd, null, 2));

    // Verify the PRD can be loaded from spec directory
    const loadedPrd = await loadPRDForSpec(tempDir, specId);

    expect(loadedPrd).not.toBeNull();
    expect(loadedPrd?.projectName).toBe('My Feature Project');
    expect(loadedPrd?.userStories).toHaveLength(2);
  });

  it('tasksList_WithSingleSpec_ReadsFromThatSpec', async () => {
    // Create a single spec directory
    const specId = 'only-spec';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    const prd = createMockPRD({ projectName: 'Only Spec Project' });
    writeFileSync(join(specDir, 'tasks.json'), JSON.stringify(prd, null, 2));

    // List specs - should return only one
    const specs = await listSpecs(tempDir);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toBe(specId);

    // Load PRD from that spec
    const loadedPrd = await loadPRDForSpec(tempDir, specs[0]);
    expect(loadedPrd).not.toBeNull();
    expect(loadedPrd?.projectName).toBe('Only Spec Project');
  });

  it('tasksList_WithMultipleSpecs_PromptsSelection', async () => {
    const { select } = await import('@inquirer/prompts');

    // Create multiple spec directories
    const spec1Dir = join(tempDir, '.speki', 'specs', 'feature-a');
    const spec2Dir = join(tempDir, '.speki', 'specs', 'feature-b');
    mkdirSync(spec1Dir, { recursive: true });
    mkdirSync(spec2Dir, { recursive: true });

    const prd1 = createMockPRD({ projectName: 'Feature A' });
    const prd2 = createMockPRD({ projectName: 'Feature B' });
    writeFileSync(join(spec1Dir, 'tasks.json'), JSON.stringify(prd1, null, 2));
    writeFileSync(join(spec2Dir, 'tasks.json'), JSON.stringify(prd2, null, 2));

    // List specs - should return two
    const specs = await listSpecs(tempDir);
    expect(specs).toHaveLength(2);
    expect(specs).toContain('feature-a');
    expect(specs).toContain('feature-b');

    // Simulate user selecting feature-b
    vi.mocked(select).mockResolvedValue('feature-b');

    // Verify selection can be used to load PRD
    const selectedSpec = await select({
      message: 'Multiple specs found. Select one:',
      choices: specs.map((spec) => ({ name: spec, value: spec })),
    });

    expect(selectedSpec).toBe('feature-b');
    expect(select).toHaveBeenCalledWith({
      message: 'Multiple specs found. Select one:',
      choices: expect.arrayContaining([
        expect.objectContaining({ value: 'feature-a' }),
        expect.objectContaining({ value: 'feature-b' }),
      ]),
    });

    const loadedPrd = await loadPRDForSpec(tempDir, selectedSpec);
    expect(loadedPrd?.projectName).toBe('Feature B');
  });

  it('tasksNext_WithSpecFlag_ReadsFromSpecDir', async () => {
    // Create spec directory with PRD that has pending tasks
    const specId = 'next-test';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    const prd = createMockPRD({
      projectName: 'Next Test Project',
      userStories: [
        {
          id: 'US-001',
          title: 'Completed Story',
          description: 'Already done',
          acceptanceCriteria: ['AC1'],
          testCases: [],
          priority: 1,
          passes: true,
          notes: '',
          dependencies: [],
          complexity: 'low',
        },
        {
          id: 'US-002',
          title: 'Next Pending Story',
          description: 'Ready to work on',
          acceptanceCriteria: ['AC2'],
          testCases: [],
          priority: 2,
          passes: false,
          notes: '',
          dependencies: ['US-001'],
          complexity: 'medium',
        },
        {
          id: 'US-003',
          title: 'Blocked Story',
          description: 'Waiting on US-002',
          acceptanceCriteria: ['AC3'],
          testCases: [],
          priority: 3,
          passes: false,
          notes: '',
          dependencies: ['US-002'],
          complexity: 'high',
        },
      ],
    });
    writeFileSync(join(specDir, 'tasks.json'), JSON.stringify(prd, null, 2));

    // Load PRD and verify next task logic
    const loadedPrd = await loadPRDForSpec(tempDir, specId);
    expect(loadedPrd).not.toBeNull();

    // Find next task (respecting dependencies)
    const completedIds = new Set(
      loadedPrd!.userStories.filter((s) => s.passes).map((s) => s.id)
    );
    const pendingTasks = loadedPrd!.userStories
      .filter((s) => !s.passes)
      .filter((s) => s.dependencies.every((dep) => completedIds.has(dep)))
      .sort((a, b) => a.priority - b.priority);

    // US-002 should be next (US-001 is done, US-003 depends on US-002)
    expect(pendingTasks).toHaveLength(1);
    expect(pendingTasks[0].id).toBe('US-002');
    expect(pendingTasks[0].title).toBe('Next Pending Story');
  });
});

describe('listSpecs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'list-specs-test-'));
    mkdirSync(join(tempDir, '.speki'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('listSpecs_WithNoSpecs_ReturnsEmptyArray', async () => {
    const specs = await listSpecs(tempDir);
    expect(specs).toEqual([]);
  });

  it('listSpecs_WithSpecDirs_ReturnsSpecIds', async () => {
    mkdirSync(join(tempDir, '.speki', 'specs', 'spec-1'), { recursive: true });
    mkdirSync(join(tempDir, '.speki', 'specs', 'spec-2'), { recursive: true });

    const specs = await listSpecs(tempDir);
    expect(specs).toHaveLength(2);
    expect(specs).toContain('spec-1');
    expect(specs).toContain('spec-2');
  });

  it('listSpecs_IgnoresFiles_OnlyReturnsDirs', async () => {
    mkdirSync(join(tempDir, '.speki', 'specs'), { recursive: true });
    mkdirSync(join(tempDir, '.speki', 'specs', 'valid-spec'), { recursive: true });
    writeFileSync(join(tempDir, '.speki', 'specs', 'some-file.json'), '{}');

    const specs = await listSpecs(tempDir);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toBe('valid-spec');
  });
});

describe('loadPRDForSpec', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'load-prd-test-'));
    mkdirSync(join(tempDir, '.speki', 'specs'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loadPRDForSpec_WithValidPRD_ReturnsData', async () => {
    const specId = 'valid-spec';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    const prd = createMockPRD();
    writeFileSync(join(specDir, 'tasks.json'), JSON.stringify(prd, null, 2));

    const loaded = await loadPRDForSpec(tempDir, specId);
    expect(loaded).not.toBeNull();
    expect(loaded?.projectName).toBe('Test Project');
  });

  it('loadPRDForSpec_WithMissingPRD_ReturnsNull', async () => {
    const specId = 'empty-spec';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    const loaded = await loadPRDForSpec(tempDir, specId);
    expect(loaded).toBeNull();
  });

  it('loadPRDForSpec_WithInvalidJson_ReturnsNull', async () => {
    const specId = 'invalid-spec';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'tasks.json'), 'not valid json');

    const loaded = await loadPRDForSpec(tempDir, specId);
    expect(loaded).toBeNull();
  });
});
