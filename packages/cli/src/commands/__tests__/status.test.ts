import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PRDData, SpecMetadata } from '@speki/core';
import { getSpecsInfo } from '../status.js';

function createMockMetadata(overrides: Partial<SpecMetadata> = {}): SpecMetadata {
  return {
    created: '2026-01-10T10:00:00Z',
    lastModified: '2026-01-10T12:00:00Z',
    status: 'draft',
    specPath: 'specs/test.md',
    ...overrides,
  };
}

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
        title: 'Story 1',
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
        title: 'Story 2',
        description: 'Description 2',
        acceptanceCriteria: ['AC2'],
        testCases: [],
        priority: 2,
        passes: true,
        notes: '',
        dependencies: [],
        complexity: 'low' as const,
      },
    ],
    ...overrides,
  };
}

describe('status command - getSpecsInfo', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'status-test-'));
    mkdirSync(join(tempDir, '.speki'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('status_WithNoSpecs_ShowsNoSpecsMessage', async () => {
    // No specs directory exists
    const specs = await getSpecsInfo(tempDir);
    expect(specs).toHaveLength(0);
  });

  it('status_WithOneSpec_ShowsSpecDetails', async () => {
    // Create one spec
    const specId = 'my-feature';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    const metadata = createMockMetadata({
      status: 'draft',
      specPath: 'specs/my-feature.md',
    });
    writeFileSync(join(specDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    const specs = await getSpecsInfo(tempDir);

    expect(specs).toHaveLength(1);
    expect(specs[0].id).toBe('my-feature');
    expect(specs[0].metadata.status).toBe('draft');
    expect(specs[0].metadata.lastModified).toBe('2026-01-10T12:00:00Z');
    expect(specs[0].taskProgress).toBeUndefined();
  });

  it('status_WithMultipleSpecs_ListsAllSpecs', async () => {
    // Create multiple specs
    const specIds = ['spec-alpha', 'spec-beta', 'spec-gamma'];

    for (const specId of specIds) {
      const specDir = join(tempDir, '.speki', 'specs', specId);
      mkdirSync(specDir, { recursive: true });

      const metadata = createMockMetadata({
        status: 'draft',
        specPath: `specs/${specId}.md`,
      });
      writeFileSync(join(specDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }

    const specs = await getSpecsInfo(tempDir);

    expect(specs).toHaveLength(3);
    const ids = specs.map((s) => s.id);
    expect(ids).toContain('spec-alpha');
    expect(ids).toContain('spec-beta');
    expect(ids).toContain('spec-gamma');
  });

  it('status_WithDecomposedSpec_ShowsTaskProgress', async () => {
    // Create a decomposed spec with PRD
    const specId = 'decomposed-feature';
    const specDir = join(tempDir, '.speki', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    const metadata = createMockMetadata({
      status: 'decomposed',
      specPath: 'specs/decomposed-feature.md',
    });
    writeFileSync(join(specDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Create PRD with 2 stories, 1 completed
    const prd = createMockPRD();
    writeFileSync(join(specDir, 'tasks.json'), JSON.stringify(prd, null, 2));

    const specs = await getSpecsInfo(tempDir);

    expect(specs).toHaveLength(1);
    expect(specs[0].id).toBe('decomposed-feature');
    expect(specs[0].metadata.status).toBe('decomposed');
    expect(specs[0].taskProgress).toBeDefined();
    expect(specs[0].taskProgress?.total).toBe(2);
    expect(specs[0].taskProgress?.completed).toBe(1);
  });

  it('status_WithActiveSpec_IndicatesActive', async () => {
    // Create multiple specs with one active
    const draftSpecDir = join(tempDir, '.speki', 'specs', 'draft-spec');
    mkdirSync(draftSpecDir, { recursive: true });
    writeFileSync(
      join(draftSpecDir, 'metadata.json'),
      JSON.stringify(createMockMetadata({ status: 'draft' }), null, 2)
    );

    const activeSpecDir = join(tempDir, '.speki', 'specs', 'active-spec');
    mkdirSync(activeSpecDir, { recursive: true });
    writeFileSync(
      join(activeSpecDir, 'metadata.json'),
      JSON.stringify(createMockMetadata({ status: 'active' }), null, 2)
    );

    // Active spec also needs a PRD to show task progress
    const prd = createMockPRD();
    writeFileSync(join(activeSpecDir, 'tasks.json'), JSON.stringify(prd, null, 2));

    const specs = await getSpecsInfo(tempDir);

    expect(specs).toHaveLength(2);

    const activeSpec = specs.find((s) => s.id === 'active-spec');
    expect(activeSpec).toBeDefined();
    expect(activeSpec?.metadata.status).toBe('active');
    expect(activeSpec?.taskProgress).toBeDefined();

    const draftSpec = specs.find((s) => s.id === 'draft-spec');
    expect(draftSpec).toBeDefined();
    expect(draftSpec?.metadata.status).toBe('draft');
  });
});
