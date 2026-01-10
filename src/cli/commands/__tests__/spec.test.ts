import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateSpecFile } from '../spec.js';

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
