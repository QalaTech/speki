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
import { mkdtemp, rm, stat, readFile, writeFile } from 'fs/promises';
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
    const expected = path.join('/project', '.speki', 'specs', 'my-spec');
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
    const expectedPath = path.join(testDir, '.speki', 'specs', 'new-spec');
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
      path.join(testDir, '.speki', 'specs', specId)
    );
  });
});

describe('getSpecLogsDir', () => {
  it('getSpecLogsDir_WithValidInputs_ReturnsLogsSubpath', () => {
    const result = getSpecLogsDir('/project', 'my-spec');
    expect(result).toBe(
      path.join('/project', '.speki', 'specs', 'my-spec', 'logs')
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
      '.speki',
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

    const specDir = path.join(testDir, '.speki', 'specs', specId);
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


describe('spec isolation', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'spec-isolation-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('isolation_SequentialDecompose_PreservesFirstSpecState', async () => {
    // Arrange - Simulate decompose for specA
    const specIdA = 'specA';
    const specIdB = 'specB';
    
    // Initialize specA with metadata and decompose state
    await initSpecMetadata(testDir, 'specs/specA.md');
    await updateSpecStatus(testDir, specIdA, 'decomposed');
    
    // Write decompose_state.json for specA
    const specDirA = await ensureSpecDir(testDir, specIdA);
    const decomposeStateA = {
      projectName: 'Spec A Project',
      branchName: 'feature-a',
      userStories: [{ id: 'US-001', title: 'Story A1' }],
    };
    await writeFile(
      path.join(specDirA, 'decompose_state.json'),
      JSON.stringify(decomposeStateA, null, 2)
    );
    
    // Capture specA's decompose_state.json content before decomposing specB
    const specAStateBeforeB = await readFile(
      path.join(specDirA, 'decompose_state.json'),
      'utf-8'
    );

    // Act - Simulate decompose for specB
    await initSpecMetadata(testDir, 'specs/specB.md');
    await updateSpecStatus(testDir, specIdB, 'decomposed');
    
    const specDirB = await ensureSpecDir(testDir, specIdB);
    const decomposeStateB = {
      projectName: 'Spec B Project',
      branchName: 'feature-b',
      userStories: [{ id: 'US-001', title: 'Story B1' }, { id: 'US-002', title: 'Story B2' }],
    };
    await writeFile(
      path.join(specDirB, 'decompose_state.json'),
      JSON.stringify(decomposeStateB, null, 2)
    );

    // Assert - specA's decompose_state.json should be unchanged
    const specAStateAfterB = await readFile(
      path.join(specDirA, 'decompose_state.json'),
      'utf-8'
    );
    expect(specAStateAfterB).toBe(specAStateBeforeB);
    expect(JSON.parse(specAStateAfterB)).toEqual(decomposeStateA);
  });

  it('isolation_BothSpecsHaveSeparateDirs', async () => {
    // Arrange
    const specIdA = 'specA';
    const specIdB = 'specB';

    // Act - Create directories for both specs
    const specDirA = await ensureSpecDir(testDir, specIdA);
    const specDirB = await ensureSpecDir(testDir, specIdB);

    // Assert - Directories should be different and both should exist
    expect(specDirA).not.toBe(specDirB);
    expect(specDirA).toBe(path.join(testDir, '.speki', 'specs', specIdA));
    expect(specDirB).toBe(path.join(testDir, '.speki', 'specs', specIdB));

    // Verify both directories exist
    const statA = await stat(specDirA);
    const statB = await stat(specDirB);
    expect(statA.isDirectory()).toBe(true);
    expect(statB.isDirectory()).toBe(true);
  });

  it('isolation_MetadataFilesAreIndependent', async () => {
    // Arrange
    const specIdA = 'specA';
    const specIdB = 'specB';
    
    // Initialize both specs
    await initSpecMetadata(testDir, 'specs/specA.md');
    await initSpecMetadata(testDir, 'specs/specB.md');

    // Act - Update specB's status to decomposed
    await updateSpecStatus(testDir, specIdB, 'decomposed');

    // Assert - specA's metadata should still be draft, specB should be decomposed
    const readMetadataA = await readSpecMetadata(testDir, specIdA);
    const readMetadataB = await readSpecMetadata(testDir, specIdB);

    expect(readMetadataA?.status).toBe('draft');
    expect(readMetadataB?.status).toBe('decomposed');
    expect(readMetadataA?.specPath).toBe('specs/specA.md');
    expect(readMetadataB?.specPath).toBe('specs/specB.md');
  });
});
