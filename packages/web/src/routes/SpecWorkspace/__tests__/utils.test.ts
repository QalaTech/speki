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
  it('removes timestamp prefix from filename', () => {
    expect(extractDocumentTitle('20240115-143022-feature-name.prd.md')).toBe('Feature Name');
  });

  it('removes file extension from filename', () => {
    expect(extractDocumentTitle('spec-file.tech.md')).toBe('Spec File');
  });

  it('handles bug spec extension', () => {
    expect(extractDocumentTitle('bug-report.bug.md')).toBe('Bug Report');
  });

  it('returns "Untitled" for empty filename', () => {
    expect(extractDocumentTitle('')).toBe('Untitled');
  });

  it('converts underscores to spaces', () => {
    expect(extractDocumentTitle('my_file_name.prd.md')).toBe('My File Name');
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
