import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractSpecId,
  getSpecDir,
  ensureSpecDir,
  getSpecLogsDir,
} from '../spec-metadata.js';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

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
