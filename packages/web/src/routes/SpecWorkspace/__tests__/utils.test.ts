import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, extractDocumentTitle, isDecomposeForSpec } from '../utils';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for times less than 5 seconds ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const date = new Date('2024-01-01T11:59:56Z');
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns seconds for times less than 60 seconds ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const date = new Date('2024-01-01T11:59:30Z');
    expect(formatRelativeTime(date)).toBe('30s ago');
  });

  it('returns minutes for times less than 60 minutes ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const date = new Date('2024-01-01T11:30:00Z');
    expect(formatRelativeTime(date)).toBe('30m ago');
  });

  it('returns hours for times over 60 minutes ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const date = new Date('2024-01-01T10:00:00Z');
    expect(formatRelativeTime(date)).toBe('2h ago');
  });
});

describe('extractDocumentTitle', () => {
  it('extracts H1 from markdown content', () => {
    const content = '# My Document Title\n\nSome content here';
    expect(extractDocumentTitle(content, 'file.prd.md')).toBe('My Document Title');
  });

  it('handles H1 with extra whitespace', () => {
    const content = '#   Spaced Out Title   \n\nContent';
    expect(extractDocumentTitle(content, 'file.prd.md')).toBe('Spaced Out Title');
  });

  it('falls back to formatted filename when no H1', () => {
    const content = '## Subheading\n\nNo H1 here';
    expect(extractDocumentTitle(content, 'my-document.prd.md')).toBe('My Document');
  });

  it('removes timestamp prefix from filename', () => {
    const content = '';
    expect(extractDocumentTitle(content, '20240115-143022-feature-name.prd.md')).toBe('Feature Name');
  });

  it('removes file extension from filename', () => {
    const content = '';
    expect(extractDocumentTitle(content, 'spec-file.tech.md')).toBe('Spec File');
  });

  it('handles bug spec extension', () => {
    const content = '';
    expect(extractDocumentTitle(content, 'bug-report.bug.md')).toBe('Bug Report');
  });

  it('returns "Untitled" for empty content and filename', () => {
    expect(extractDocumentTitle('', '')).toBe('Untitled');
  });

  it('converts underscores to spaces', () => {
    const content = '';
    expect(extractDocumentTitle(content, 'my_file_name.prd.md')).toBe('My File Name');
  });
});

describe('isDecomposeForSpec', () => {
  it('returns true for exact match', () => {
    expect(isDecomposeForSpec('/path/to/spec.prd.md', '/path/to/spec.prd.md')).toBe(true);
  });

  it('returns true when decompose path ends with selected path', () => {
    expect(isDecomposeForSpec('/project/specs/feature.prd.md', 'specs/feature.prd.md')).toBe(true);
  });

  it('returns true when selected path ends with decompose path', () => {
    expect(isDecomposeForSpec('feature.prd.md', '/project/specs/feature.prd.md')).toBe(true);
  });

  it('returns false for non-matching paths', () => {
    expect(isDecomposeForSpec('/path/to/spec-a.prd.md', '/path/to/spec-b.prd.md')).toBe(false);
  });

  it('returns false when decompose file is undefined', () => {
    expect(isDecomposeForSpec(undefined, '/path/to/spec.prd.md')).toBe(false);
  });
});
