import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { executeSplit } from '../splitter.js';
import type { SplitProposal } from '../../../types/index.js';

function createTestProposal(
  overrides: Partial<SplitProposal> = {}
): SplitProposal {
  return {
    originalFile: 'test-spec.md',
    reason: 'Spec should be split: multiple feature domains',
    proposedSpecs: [
      {
        filename: 'test-spec-auth.md',
        description: 'Authentication Module',
        estimatedStories: 5,
        sections: ['Authentication', 'Login'],
      },
      {
        filename: 'test-spec-user.md',
        description: 'User Management Module',
        estimatedStories: 4,
        sections: ['User Management'],
      },
    ],
    ...overrides,
  };
}

const SAMPLE_SPEC_CONTENT = `# Original Spec

## Overview
This is a comprehensive spec covering multiple features.

## Authentication
User authentication handles login, logout, and session management.

### Requirements
- Users must be able to log in with email/password
- Sessions expire after 24 hours

## Login
The login flow includes validation and error handling.

### Acceptance Criteria
- Invalid credentials show error message
- Successful login redirects to dashboard

## User Management
User management covers profile updates and account settings.

### Requirements
- Users can update their profile information
- Users can change their password

## Notifications
Push notifications and email alerts.

### Requirements
- Users receive email notifications
`;

describe('splitter', () => {
  let testDir: string;
  let originalSpecPath: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `splitter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
    originalSpecPath = join(testDir, 'test-spec.md');
    await writeFile(originalSpecPath, SAMPLE_SPEC_CONTENT, 'utf-8');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('executeSplit_WithValidProposal_CreatesAllFiles', async () => {
    // Arrange
    const proposal = createTestProposal();

    // Act
    const createdPaths = await executeSplit(originalSpecPath, proposal);

    // Assert
    expect(createdPaths).toHaveLength(2);
    const files = await readdir(testDir);
    expect(files).toContain('test-spec-auth.md');
    expect(files).toContain('test-spec-user.md');
  });

  it('executeSplit_PreservesOriginalSpec', async () => {
    // Arrange
    const proposal = createTestProposal();
    const originalContentBefore = await readFile(originalSpecPath, 'utf-8');

    // Act
    await executeSplit(originalSpecPath, proposal);

    // Assert
    const originalContentAfter = await readFile(originalSpecPath, 'utf-8');
    expect(originalContentAfter).toBe(originalContentBefore);
  });

  it('executeSplit_AddsSplitFromHeader', async () => {
    // Arrange
    const proposal = createTestProposal();

    // Act
    await executeSplit(originalSpecPath, proposal);

    // Assert
    const authContent = await readFile(
      join(testDir, 'test-spec-auth.md'),
      'utf-8'
    );
    const userContent = await readFile(
      join(testDir, 'test-spec-user.md'),
      'utf-8'
    );

    expect(authContent).toContain('<!-- Split from: test-spec.md -->');
    expect(userContent).toContain('<!-- Split from: test-spec.md -->');
  });

  it('executeSplit_PlacesFilesInSameDirectory', async () => {
    // Arrange
    const nestedDir = join(testDir, 'specs', 'features');
    await mkdir(nestedDir, { recursive: true });
    const nestedSpecPath = join(nestedDir, 'nested-spec.md');
    await writeFile(nestedSpecPath, SAMPLE_SPEC_CONTENT, 'utf-8');

    const proposal = createTestProposal({
      originalFile: 'nested-spec.md',
    });

    // Act
    const createdPaths = await executeSplit(nestedSpecPath, proposal);

    // Assert
    for (const path of createdPaths) {
      expect(path.startsWith(nestedDir)).toBe(true);
    }
    const files = await readdir(nestedDir);
    expect(files).toContain('test-spec-auth.md');
    expect(files).toContain('test-spec-user.md');
  });

  it('executeSplit_ReturnsCreatedFilePaths', async () => {
    // Arrange
    const proposal = createTestProposal();

    // Act
    const createdPaths = await executeSplit(originalSpecPath, proposal);

    // Assert
    expect(createdPaths).toEqual([
      join(testDir, 'test-spec-auth.md'),
      join(testDir, 'test-spec-user.md'),
    ]);
  });
});
