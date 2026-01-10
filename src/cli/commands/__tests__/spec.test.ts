import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findSpecFiles, validateSpecFile } from '../spec.js';

describe('spec review command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'spec-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('specReview_WithValidFile_DelegatesToRunner', () => {
    const specFile = join(tempDir, 'test-spec.md');
    writeFileSync(specFile, '# Test Spec\n\nThis is a test specification.');

    const result = validateSpecFile(specFile);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('specReview_WithMissingFile_DisplaysError', () => {
    const nonExistentFile = join(tempDir, 'non-existent.md');

    const result = validateSpecFile(nonExistentFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('File not found');
    expect(result.error).toContain(nonExistentFile);
  });

  it('specReview_WithNonMarkdownFile_DisplaysError', () => {
    const txtFile = join(tempDir, 'test-spec.txt');
    writeFileSync(txtFile, 'This is a text file, not markdown.');

    const result = validateSpecFile(txtFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a markdown file');
    expect(result.error).toContain('.md');
    expect(result.error).toContain(txtFile);
  });
});

describe('findSpecFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'spec-find-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('findSpecFiles_SearchesAllDirectories', async () => {
    mkdirSync(join(tempDir, 'specs'));
    mkdirSync(join(tempDir, 'docs'));
    mkdirSync(join(tempDir, '.ralph'));
    mkdirSync(join(tempDir, '.ralph/specs'));

    writeFileSync(join(tempDir, 'specs', 'feature-spec.md'), '# Feature Spec');
    writeFileSync(join(tempDir, 'docs', 'api-doc.md'), '# API Doc');
    writeFileSync(join(tempDir, '.ralph/specs', 'internal-spec.md'), '# Internal Spec');
    writeFileSync(join(tempDir, 'root-readme.md'), '# Root Readme');

    const results = await findSpecFiles(tempDir);

    expect(results).toHaveLength(4);
    expect(results.some((f) => f.includes('specs/feature-spec.md'))).toBe(true);
    expect(results.some((f) => f.includes('docs/api-doc.md'))).toBe(true);
    expect(results.some((f) => f.includes('.ralph/specs/internal-spec.md'))).toBe(true);
    expect(results.some((f) => f.includes('root-readme.md'))).toBe(true);
  });

  it('findSpecFiles_ReturnsOnlyMarkdownFiles', async () => {
    mkdirSync(join(tempDir, 'specs'));
    writeFileSync(join(tempDir, 'specs', 'valid-spec.md'), '# Valid Spec');
    writeFileSync(join(tempDir, 'specs', 'script.js'), 'console.log("hello");');
    writeFileSync(join(tempDir, 'specs', 'data.json'), '{"key": "value"}');
    writeFileSync(join(tempDir, 'specs', 'notes.txt'), 'Some notes');

    const results = await findSpecFiles(tempDir);

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('valid-spec.md');
  });

  it('specReview_WithNoArgs_ShowsFilePicker', async () => {
    mkdirSync(join(tempDir, 'specs'));
    writeFileSync(join(tempDir, 'specs', 'test-spec.md'), '# Test Spec');
    writeFileSync(join(tempDir, 'specs', 'another-spec.md'), '# Another Spec');

    const results = await findSpecFiles(tempDir);

    expect(results).toHaveLength(2);
    expect(results.every((f) => f.endsWith('.md'))).toBe(true);
  });
});
