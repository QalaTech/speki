import { describe, it, expect } from 'vitest';
import { extractSpecId } from '../spec-metadata.js';

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
