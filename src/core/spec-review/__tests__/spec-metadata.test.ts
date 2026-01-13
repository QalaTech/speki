import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractSpecId,
  getSpecDir,
  ensureSpecDir,
  getSpecLogsDir,
  readSpecMetadata,
  writeSpecMetadata,
  initSpecMetadata,
  transitionSpecStatus,
  updateSpecStatus,
} from '../spec-metadata.js';
import { mkdtemp, rm, stat, readFile } from 'fs/promises';
import type { SpecMetadata } from '../../../types/index.js';
import { tmpdir } from 'os';
import path from 'path';

function createTestMetadata(specPath: string, status: 'draft' | 'reviewed' | 'decomposed' | 'active' | 'completed' = 'draft'): SpecMetadata {
  return {
    created: '2026-01-13T12:00:00.000Z',
    lastModified: '2026-01-13T12:00:00.000Z',
    status,
    specPath,
  };
}

describe('extractSpecId', () => {
  it('extractSpecId_WithSimpleFilename_ReturnsNameWithoutExtension', () => {
    const result = extractSpecId('specs/foo.md');
    expect(result).toBe('foo');
  });

  it('extractSpecId_WithTimestampPrefix_ReturnsFullId', () => {
    const result = extractSpecId('specs/20260112-105832-spec-partitioning.md');
    expect(result).toBe('20260112-105832-spec-partitioning');
  });

  it('extractSpecId_WithNestedPath_ReturnsOnlyFilename', () => {
    const result = extractSpecId('project/specs/nested/deep/my-spec.md');
    expect(result).toBe('my-spec');
  });

  it('extractSpecId_WithAbsolutePath_ReturnsOnlyFilename', () => {
    const result = extractSpecId('/absolute/path/to/spec.md');
    expect(result).toBe('spec');
  });

  it('extractSpecId_WithoutMdExtension_ReturnsAsIs', () => {
    const result = extractSpecId('specs/readme.txt');
    expect(result).toBe('readme.txt');
  });
});

describe('getSpecDir', () => {
  it('getSpecDir_WithValidInputs_ReturnsCorrectPath', () => {
    const result = getSpecDir('/project', 'my-spec');
    const expected = path.join('/project', '.ralph', 'specs', 'my-spec');
    expect(result).toBe(expected);
  });
});

describe('ensureSpecDir', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'spec-metadata-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('ensureSpecDir_WhenDirNotExists_CreatesDirectoryStructure', async () => {
    const result = await ensureSpecDir(testDir, 'new-spec');
    const expectedPath = path.join(testDir, '.ralph', 'specs', 'new-spec');
    expect(result).toBe(expectedPath);

    const dirStat = await stat(expectedPath);
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('ensureSpecDir_WhenDirExists_ReturnsSamePath', async () => {
    const specId = 'existing-spec';
    const firstResult = await ensureSpecDir(testDir, specId);
    const secondResult = await ensureSpecDir(testDir, specId);

    expect(firstResult).toBe(secondResult);
    expect(secondResult).toBe(
      path.join(testDir, '.ralph', 'specs', specId)
    );
  });
});

describe('getSpecLogsDir', () => {
  it('getSpecLogsDir_WithValidInputs_ReturnsLogsSubpath', () => {
    const result = getSpecLogsDir('/project', 'my-spec');
    expect(result).toBe(
      path.join('/project', '.ralph', 'specs', 'my-spec', 'logs')
    );
  });
});

describe('readSpecMetadata', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'spec-metadata-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('readSpecMetadata_WhenFileExists_ReturnsMetadata', async () => {
    const specId = 'test-spec';
    const metadata = createTestMetadata('specs/test-spec.md');
    await writeSpecMetadata(testDir, specId, metadata);

    const result = await readSpecMetadata(testDir, specId);
    expect(result).toEqual(metadata);
  });

  it('readSpecMetadata_WhenFileNotExists_ReturnsNull', async () => {
    const result = await readSpecMetadata(testDir, 'nonexistent-spec');
    expect(result).toBeNull();
  });
});

describe('writeSpecMetadata', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'spec-metadata-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('writeSpecMetadata_WithValidData_PersistsToFile', async () => {
    const specId = 'test-spec';
    const metadata = createTestMetadata('specs/test-spec.md', 'reviewed');

    await writeSpecMetadata(testDir, specId, metadata);

    const metadataPath = path.join(
      testDir,
      '.ralph',
      'specs',
      specId,
      'metadata.json'
    );
    const content = await readFile(metadataPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(metadata);
  });

  it('writeSpecMetadata_WhenDirNotExists_CreatesDir', async () => {
    const specId = 'new-spec';
    const metadata = createTestMetadata('specs/new-spec.md');

    await writeSpecMetadata(testDir, specId, metadata);

    const specDir = path.join(testDir, '.ralph', 'specs', specId);
    const dirStat = await stat(specDir);
    expect(dirStat.isDirectory()).toBe(true);
  });
});

describe('initSpecMetadata', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'spec-metadata-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('initSpecMetadata_CreatesMetadataWithDraftStatus', async () => {
    const specPath = 'specs/my-new-spec.md';
    const result = await initSpecMetadata(testDir, specPath);

    expect(result.status).toBe('draft');
    expect(result.specPath).toBe(specPath);
  });

  it('initSpecMetadata_SetsCreatedAndLastModifiedToNow', async () => {
    const before = new Date().toISOString();
    const result = await initSpecMetadata(testDir, 'specs/timed-spec.md');
    const after = new Date().toISOString();

    expect(result.created).toBe(result.lastModified);
    expect(result.created >= before).toBe(true);
    expect(result.created <= after).toBe(true);
  });
});

describe('transitionSpecStatus', () => {
  it('transitionSpecStatus_DraftToReviewed_ReturnsTrue', () => {
    expect(transitionSpecStatus('draft', 'reviewed')).toBe(true);
  });

  it('transitionSpecStatus_DraftToDecomposed_ReturnsTrue', () => {
    expect(transitionSpecStatus('draft', 'decomposed')).toBe(true);
  });

  it('transitionSpecStatus_ReviewedToDecomposed_ReturnsTrue', () => {
    expect(transitionSpecStatus('reviewed', 'decomposed')).toBe(true);
  });

  it('transitionSpecStatus_DecomposedToActive_ReturnsTrue', () => {
    expect(transitionSpecStatus('decomposed', 'active')).toBe(true);
  });

  it('transitionSpecStatus_ActiveToCompleted_ReturnsTrue', () => {
    expect(transitionSpecStatus('active', 'completed')).toBe(true);
  });

  it('transitionSpecStatus_CompletedToDraft_ReturnsFalse', () => {
    expect(transitionSpecStatus('completed', 'draft')).toBe(false);
  });

  it('transitionSpecStatus_ActiveToReviewed_ReturnsFalse', () => {
    expect(transitionSpecStatus('active', 'reviewed')).toBe(false);
  });
});

describe('updateSpecStatus', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'spec-metadata-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('updateSpecStatus_WithValidTransition_UpdatesMetadata', async () => {
    const specId = 'transition-test';
    const initialMetadata = createTestMetadata('specs/transition-test.md');
    await writeSpecMetadata(testDir, specId, initialMetadata);

    await updateSpecStatus(testDir, specId, 'reviewed');

    const updated = await readSpecMetadata(testDir, specId);
    expect(updated?.status).toBe('reviewed');
    expect(updated?.lastModified).not.toBe(initialMetadata.lastModified);
  });

  it('updateSpecStatus_WithInvalidTransition_ThrowsError', async () => {
    const specId = 'invalid-transition';
    const metadata = createTestMetadata('specs/invalid-transition.md', 'completed');
    await writeSpecMetadata(testDir, specId, metadata);

    await expect(
      updateSpecStatus(testDir, specId, 'draft')
    ).rejects.toThrow('Invalid status transition: completed → draft');
  });
});
