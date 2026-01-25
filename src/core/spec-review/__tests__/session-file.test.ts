import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getSessionPath,
  loadSession,
  saveSession,
  computeContentHash,
} from '../session-file.js';
import type { SessionFile } from '../../../types/index.js';

function createMockSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    sessionId: 'test-session-id',
    specFilePath: '/path/to/spec.md',
    status: 'in_progress',
    startedAt: '2026-01-10T10:00:00Z',
    lastUpdatedAt: '2026-01-10T11:00:00Z',
    suggestions: [],
    changeHistory: [],
    chatMessages: [],
    ...overrides,
  };
}

describe('session-file', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `session-file-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('getSessionPath_WithNestedSpecFile_ReturnsCorrectSessionPath', () => {
    // Arrange
    const specFilePath = '/some/nested/path/my-feature-spec.md';

    // Act
    const result = getSessionPath(specFilePath);

    // Assert
    expect(result).toBe(
      join(testDir, '.speki', 'sessions', 'my-feature-spec.session.json')
    );
  });

  it('loadSession_WithExistingSession_ReturnsSessionFile', async () => {
    // Arrange
    const specFilePath = '/path/to/feature-spec.md';
    const sessionsDir = join(testDir, '.speki', 'sessions');
    await mkdir(sessionsDir, { recursive: true });

    const mockSession = createMockSession({
      sessionId: 'test-session-123',
      specFilePath: '/path/to/feature-spec.md',
    });

    await writeFile(
      join(sessionsDir, 'feature-spec.session.json'),
      JSON.stringify(mockSession, null, 2),
      'utf-8'
    );

    // Act
    const result = await loadSession(specFilePath);

    // Assert
    expect(result).toEqual(mockSession);
  });

  it('loadSession_WithNoSession_ReturnsNull', async () => {
    // Arrange
    const specFilePath = '/path/to/nonexistent-spec.md';

    // Act
    const result = await loadSession(specFilePath);

    // Assert
    expect(result).toBeNull();
  });

  it('saveSession_WithValidSession_WritesJsonFile', async () => {
    // Arrange
    const session = createMockSession({
      sessionId: 'save-test-456',
      specFilePath: '/path/to/save-spec.md',
      status: 'completed',
      completedAt: '2026-01-10T12:00:00Z',
    });

    // Act
    await saveSession(session);

    // Assert
    const sessionsDir = join(testDir, '.speki', 'sessions');
    const savedContent = await readFile(
      join(sessionsDir, 'save-spec.session.json'),
      'utf-8'
    );
    const savedSession = JSON.parse(savedContent);
    expect(savedSession).toEqual(session);
  });

  it('saveSession_WithMissingDirectory_CreatesDirectory', async () => {
    // Arrange
    const session = createMockSession({
      sessionId: 'mkdir-test-789',
      specFilePath: '/path/to/mkdir-spec.md',
    });

    // Act
    await saveSession(session);

    // Assert
    const sessionsDir = join(testDir, '.speki', 'sessions');
    const savedContent = await readFile(
      join(sessionsDir, 'mkdir-spec.session.json'),
      'utf-8'
    );
    const savedSession = JSON.parse(savedContent);
    expect(savedSession).toEqual(session);
  });

  it('computeContentHash_WithContent_ReturnsSha256Hash', () => {
    // Arrange
    const content = 'Hello, World!';

    // Act
    const result = computeContentHash(content);

    // Assert
    // SHA256 hash is 64 hex characters
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
    // Known SHA256 hash for "Hello, World!"
    expect(result).toBe(
      'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f'
    );
  });

  it('computeContentHash_WithSameContent_ReturnsSameHash', () => {
    // Arrange
    const content1 = 'The quick brown fox jumps over the lazy dog';
    const content2 = 'The quick brown fox jumps over the lazy dog';
    const differentContent = 'A different string';

    // Act
    const hash1 = computeContentHash(content1);
    const hash2 = computeContentHash(content2);
    const hash3 = computeContentHash(differentContent);

    // Assert
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});
