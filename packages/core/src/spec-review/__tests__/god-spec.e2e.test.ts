import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectGodSpec, generateSplitProposal, generateFilename } from '../god-spec-detector.js';
import { executeSplit } from '../splitter.js';
import type { CodebaseContext, GodSpecIndicators, SplitProposal } from '../../types/index.js';

// Mock inquirer prompts for interactive flows
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  editor: vi.fn(),
}));

describe('E2E: God Spec Detection', () => {
  let tempDir: string;

  function createMockCodebaseContext(): CodebaseContext {
    return { projectType: 'typescript', existingPatterns: [], relevantFiles: [] };
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'god-spec-e2e-'));
    vi.resetAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('e2e_godSpec_LargeSpec_Detected', () => {
    it('should detect god spec when spec has many feature sections', () => {
      // Arrange - create a large spec with >3 feature sections
      const largeSpec = `# Large Enterprise Platform Spec

## User Authentication Module
Users can log in with email and password.
- Should validate credentials
- Should handle login errors
- Should support 2FA

## User Profile Management
Users can view and edit their profile.
- Should display user information
- Should allow profile updates
- Should handle avatar uploads

## Dashboard Analytics
Users see analytics on their dashboard.
- Should display charts
- Should load real-time data
- Should support date filtering

## Admin Control Panel
Admins can manage all users.
- Should list all users
- Should ban/unban users
- Should view audit logs

## Notification System
System sends notifications.
- Should send email notifications
- Should support push notifications
- Should allow notification preferences
`;
      const context = createMockCodebaseContext();

      // Act
      const result = detectGodSpec(largeSpec, context);

      // Assert
      expect(result.isGodSpec).toBe(true);
      expect(result.featureDomains.length).toBeGreaterThan(3);
      expect(result.indicators.some((i) => i.includes('feature sections'))).toBe(true);
    });

    it('should detect god spec when multiple categories are triggered', () => {
      // Arrange - create a spec that triggers 2 categories:
      // 1. Size: >3 feature sections
      // 2. Scope: >=2 user journeys (As a user/admin patterns)
      const storyRichSpec = `# Feature Rich Specification

## User Management Features

As a user, I need to manage my items.
1. Users must be able to create items
2. Users must be able to edit items
3. Users must be able to delete items
4. Users must be able to share items
5. Users must be able to export items
6. Users must be able to import items
7. Users must be able to archive items
8. Users must be able to restore items

## Admin Control Features

As an admin, I need to control the system.
- The system should track all changes
- The system should log user actions
- The system should generate reports
- The system should send notifications
- The system should validate input
- The system should handle errors

## Reporting Features

As a manager, I need to view reports.
- Given a user creates an item, then it appears in the list
- Given a user edits an item, then changes are saved
- Given a user deletes an item, then it is removed
- Given a user shares an item, then recipients can view it

## Integration Features

As a developer, I need to integrate via API.
- Given API receives request, then it validates auth
- Given webhook is triggered, then it sends notification
`;
      const context = createMockCodebaseContext();

      // Act
      const result = detectGodSpec(storyRichSpec, context);

      // Assert
      expect(result.isGodSpec).toBe(true);
      expect(result.featureDomains.length).toBeGreaterThanOrEqual(3);
    });

    it('should not detect god spec for focused single-feature specs', () => {
      // Arrange - create a small focused spec
      const focusedSpec = `# Simple Login Feature

## Overview
This spec describes the login feature for the application.

## Acceptance Criteria
- Users can enter their email
- Users can enter their password
- System validates credentials
`;
      const context = createMockCodebaseContext();

      // Act
      const result = detectGodSpec(focusedSpec, context);

      // Assert
      expect(result.isGodSpec).toBe(false);
    });
  });

  describe('e2e_godSpec_SplitProposal_Generated', () => {
    it('should generate split proposal with meaningful file names', () => {
      // Arrange
      const specContent = `# Enterprise User Management System

## User Authentication
Users can log in with email and password.
- Should validate credentials
- Should handle errors

## User Profile
Users can view and edit their profile.
- Should display user info
- Should allow edits

## Admin Dashboard
Admins can manage all users.
- Should list users
- Should ban users
`;
      const indicators: GodSpecIndicators = {
        isGodSpec: true,
        indicators: ['Size: 4 feature sections (threshold: 3)'],
        estimatedStories: 18,
        featureDomains: ['User Authentication', 'User Profile', 'Admin Dashboard'],
        systemBoundaries: ['auth', 'admin'],
      };

      // Act
      const proposal = generateSplitProposal(specContent, indicators, 'user-management.md');

      // Assert
      expect(proposal.originalFile).toBe('user-management.md');
      expect(proposal.reason).toBeDefined();
      expect(proposal.reason.length).toBeGreaterThan(0);
      expect(proposal.proposedSpecs.length).toBeGreaterThan(0);

      for (const proposedSpec of proposal.proposedSpecs) {
        expect(proposedSpec.filename).toMatch(/\.md$/);
        expect(proposedSpec.description).toBeDefined();
        expect(proposedSpec.estimatedStories).toBeGreaterThanOrEqual(1);
        expect(proposedSpec.sections.length).toBeGreaterThan(0);
      }
    });

    it('should include reason explaining why split is recommended', () => {
      // Arrange
      const specContent = `# Big System Spec

## Feature A
Description of feature A.

## Feature B
Description of feature B.

## Feature C
Description of feature C.

## Feature D
Description of feature D.
`;
      const indicators: GodSpecIndicators = {
        isGodSpec: true,
        indicators: ['Size: estimated 20 stories (threshold: 15)'],
        estimatedStories: 20,
        featureDomains: ['Feature A', 'Feature B', 'Feature C', 'Feature D'],
        systemBoundaries: [],
      };

      // Act
      const proposal = generateSplitProposal(specContent, indicators, 'big-system.md');

      // Assert
      expect(proposal.reason).toContain('Spec should be split');
      expect(proposal.reason.length).toBeGreaterThan(20);
    });
  });

  describe('e2e_godSpec_Accept_CreatesFiles', () => {
    it('should create split files when executeSplit is called', async () => {
      // Arrange - create a spec file in temp directory
      const originalFilename = 'god-spec.md';
      const originalPath = join(tempDir, originalFilename);
      const specContent = `# God Spec Example

## User Authentication
Users can log in with email and password.
- Should validate credentials
- Should handle errors
- Should support 2FA

## User Profile
Users can view and edit their profile.
- Should display user info
- Should allow edits
- Should handle avatar uploads

## Admin Dashboard
Admins can manage all users.
- Should list users
- Should ban users
- Should view audit logs
`;
      writeFileSync(originalPath, specContent);

      const proposal: SplitProposal = {
        originalFile: originalPath,
        reason: 'Spec covers multiple unrelated domains',
        proposedSpecs: [
          {
            filename: 'god-spec.user-authentication.md',
            description: 'User login and authentication',
            estimatedStories: 5,
            sections: ['User Authentication'],
          },
          {
            filename: 'god-spec.user-profile.md',
            description: 'User profile management',
            estimatedStories: 4,
            sections: ['User Profile'],
          },
          {
            filename: 'god-spec.admin-dashboard.md',
            description: 'Admin user management',
            estimatedStories: 4,
            sections: ['Admin Dashboard'],
          },
        ],
      };

      // Act
      const createdFiles = await executeSplit(originalPath, proposal);

      // Assert
      expect(createdFiles).toHaveLength(3);
      expect(createdFiles).toContain(join(tempDir, 'god-spec.user-authentication.md'));
      expect(createdFiles).toContain(join(tempDir, 'god-spec.user-profile.md'));
      expect(createdFiles).toContain(join(tempDir, 'god-spec.admin-dashboard.md'));

      for (const createdFilePath of createdFiles) {
        const content = readFileSync(createdFilePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
        expect(content).toContain('Split from:');
      }
    });

    it('should preserve original spec file unchanged', async () => {
      // Arrange
      const originalFilename = 'original-spec.md';
      const originalPath = join(tempDir, originalFilename);
      const originalContent = `# Original Spec

## Feature One
Content of feature one.

## Feature Two
Content of feature two.
`;
      writeFileSync(originalPath, originalContent);

      const proposal: SplitProposal = {
        originalFile: originalPath,
        reason: 'Split for better organization',
        proposedSpecs: [
          {
            filename: 'original-spec.feature-one.md',
            description: 'Feature one implementation',
            estimatedStories: 3,
            sections: ['Feature One'],
          },
        ],
      };

      // Act
      await executeSplit(originalPath, proposal);

      // Assert - original file should be unchanged
      const originalAfterSplit = readFileSync(originalPath, 'utf-8');
      expect(originalAfterSplit).toBe(originalContent);
    });

    it('should add split header to each created file', async () => {
      // Arrange
      const originalPath = join(tempDir, 'master-spec.md');
      const specContent = `# Master Spec

## Module A
Content for module A.

## Module B
Content for module B.
`;
      writeFileSync(originalPath, specContent);

      const proposal: SplitProposal = {
        originalFile: originalPath,
        reason: 'Modular organization',
        proposedSpecs: [
          {
            filename: 'master-spec.module-a.md',
            description: 'Module A functionality',
            estimatedStories: 2,
            sections: ['Module A'],
          },
        ],
      };

      // Act
      const createdFiles = await executeSplit(originalPath, proposal);

      // Assert
      const splitContent = readFileSync(createdFiles[0], 'utf-8');
      expect(splitContent).toContain('Split from: master-spec.md');
    });
  });

  describe('e2e_godSpec_Naming_FollowsConvention', () => {
    it('should generate kebab-case filenames from feature names', () => {
      const testCases = [
        { basename: 'spec', feature: 'User Authentication', expected: 'spec.user-authentication.md' },
        { basename: 'feature', feature: 'Admin Control Panel', expected: 'feature.admin-control-panel.md' },
        { basename: 'system', feature: 'API Integration Layer', expected: 'system.api-integration-layer.md' },
      ];

      for (const testCase of testCases) {
        expect(generateFilename(testCase.basename, testCase.feature)).toBe(testCase.expected);
      }
    });

    it('should handle stop words in feature names', () => {
      // 'The', 'A', 'An', 'Of', etc. should be filtered
      const result = generateFilename('spec', 'The Main Feature');
      expect(result).toBe('spec.main-feature.md');

      const result2 = generateFilename('spec', 'An Important Module');
      expect(result2).toBe('spec.important-module.md');
    });

    it('should limit filename to 3 words from feature name', () => {
      // Very long feature names should be truncated
      const result = generateFilename('spec', 'User Profile Settings Page Configuration');
      expect(result).toBe('spec.user-profile-settings.md');
    });

    it('should produce consistent lowercase filenames', () => {
      const testCases = [
        { feature: 'USER PROFILE', expected: 'spec.user-profile.md' },
        { feature: 'User Profile', expected: 'spec.user-profile.md' },
        { feature: 'user profile', expected: 'spec.user-profile.md' },
      ];

      for (const testCase of testCases) {
        expect(generateFilename('spec', testCase.feature)).toBe(testCase.expected);
      }
    });
  });
});
