import { describe, it, expect } from 'vitest';
import { detectGodSpec, estimateStoryCount, generateSplitProposal, generateFilename } from '../god-spec-detector.js';
import type { CodebaseContext, GodSpecIndicators } from '../../../types/index.js';

function createMockCodebaseContext(): CodebaseContext {
  return {
    projectType: 'typescript',
    existingPatterns: ['MVC', 'Repository'],
    relevantFiles: ['src/index.ts'],
  };
}

describe('detectGodSpec', () => {
  it('returns not god spec for small focused spec', () => {
    const smallSpec = `# Simple Feature Spec

## Overview
This spec describes a simple login feature.

## Acceptance Criteria
- Users can enter their email
- Users can enter their password
- System validates credentials
`;
    const context = createMockCodebaseContext();

    const result = detectGodSpec(smallSpec, context);

    expect(result.isGodSpec).toBe(false);
    expect(result.indicators).toHaveLength(0);
    expect(result.estimatedStories).toBeLessThanOrEqual(15);
  });

  it('returns god spec when many feature sections present', () => {
    // Spec with >3 feature sections and no definition of done (2 categories)
    const largeSpec = `# Large Product Spec

## User Authentication
Users can log in with email/password.
- Should validate credentials
- Should handle errors

## User Dashboard
Users see their main dashboard.
- Should display widgets
- Should load data

## User Profile
Users can manage their profile.
- Should edit name
- Should upload avatar

## User Settings
Users can configure settings.
- Should toggle notifications
- Should change theme

## Admin Panel
Admins can manage users.
- Should list users
- Should ban users
`;
    const context = createMockCodebaseContext();

    const result = detectGodSpec(largeSpec, context);

    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.some((i) => i.includes('feature sections'))).toBe(true);
    expect(result.featureDomains.length).toBeGreaterThan(3);
  });

  it('returns god spec when estimated stories exceed threshold', () => {
    // Spec that would generate >15 stories and no definition of done
    const storyHeavySpec = `# Feature Rich Spec

## Main Feature

### Requirements
1. Users must be able to create items
2. Users must be able to edit items
3. Users must be able to delete items
4. Users must be able to share items
5. Users must be able to export items
6. Users must be able to import items
7. Users must be able to archive items
8. Users must be able to restore items
9. Users must be able to duplicate items
10. Users must be able to tag items

### Admin Features
- The system should track all changes
- The system should log user actions
- The system should generate reports
- The system should send notifications
- The system should validate input
- The system should handle errors

### Additional Criteria
- Given a user creates an item, then it appears in the list
- Given a user edits an item, then changes are saved
- Given a user deletes an item, then it is removed
- Given a user shares an item, then recipients can view it
- Given a user exports items, then a file is downloaded
- Given a user imports items, then they appear in the list
`;
    const context = createMockCodebaseContext();

    const result = detectGodSpec(storyHeavySpec, context);

    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.some((i) => i.includes('estimated stories'))).toBe(true);
    expect(result.estimatedStories).toBeGreaterThan(15);
  });

  it('returns god spec when multiple user journeys detected', () => {
    // Spec with multiple user journeys and no definition of done
    const multiJourneySpec = `# Multi-Role System

## Admin Workflow
As an admin, I need to manage users.
The admin workflow includes:
- Viewing all users
- Editing user permissions

## End-User Workflow
As a user, I need to complete tasks.
The end-user workflow includes:
- Creating tasks
- Completing tasks

## Developer Integration Flow
As a developer, I need to integrate via API.
The developer workflow includes:
- API authentication
- Data sync
`;
    const context = createMockCodebaseContext();

    const result = detectGodSpec(multiJourneySpec, context);

    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.some((i) => i.includes('user journeys') || i.includes('personas'))).toBe(true);
  });

  it('returns not god spec when only one indicator category triggered', () => {
    // Spec with only one category triggered (just no DoD)
    const singleIndicatorSpec = `# Simple Feature

## Overview
A focused feature spec.

## Requirements
- Users can do one thing
- Users can do another thing
`;
    const context = createMockCodebaseContext();

    const result = detectGodSpec(singleIndicatorSpec, context);

    expect(result.isGodSpec).toBe(false);
    expect(result.indicators.filter((i) => !i.includes('Cohesion')).length).toBeLessThanOrEqual(0);
  });

  it('returns god spec when two indicator categories triggered', () => {
    // Spec with 2 categories triggered: size (>2000 words) and cohesion (no DoD)
    const longSpec = `# Long Feature Spec

## Main Feature
${' Lorem ipsum dolor sit amet. '.repeat(100)}

## Secondary Feature
${' Consectetur adipiscing elit sed do eiusmod. '.repeat(100)}

## Third Feature
${' Ut enim ad minim veniam quis nostrud. '.repeat(100)}

## Fourth Feature
${' Duis aute irure dolor in reprehenderit. '.repeat(100)}
`;
    const context = createMockCodebaseContext();

    const result = detectGodSpec(longSpec, context);

    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.length).toBeGreaterThanOrEqual(2);
    const hasSize = result.indicators.some((i) => i.includes('Size:'));
    const hasCohesion = result.indicators.some((i) => i.includes('Cohesion:'));
    expect(hasSize || hasCohesion).toBe(true);
  });
});

describe('estimateStoryCount', () => {
  it('returns reasonable estimate for typical spec', () => {
    const typicalSpec = `# User Management Feature

## Acceptance Criteria
- Given a user registers, they receive a confirmation email
- When a user logs in with valid credentials, they access the dashboard
- Should validate email format
- Must handle password strength requirements

## Requirements
1. Users can register with email
2. Users can reset their password
3. Users can update their profile

- The system validates all input
- The system logs authentication attempts
`;

    const estimate = estimateStoryCount(typicalSpec);

    expect(estimate).toBeGreaterThanOrEqual(5);
    expect(estimate).toBeLessThanOrEqual(20);
  });
});

describe('generateSplitProposal', () => {
  function createMockIndicators(overrides: Partial<GodSpecIndicators> = {}): GodSpecIndicators {
    return {
      isGodSpec: true,
      indicators: ['Size: 5 feature sections (threshold: 3)'],
      estimatedStories: 20,
      featureDomains: ['User Authentication', 'User Profile', 'User Settings', 'Admin Panel'],
      systemBoundaries: ['auth', 'notification'],
      ...overrides,
    };
  }

  it('returns valid proposal for user management spec', () => {
    const specContent = `# User Management System

## User Authentication
Users can log in with email and password.
- Should validate credentials
- Should handle errors

## User Profile
Users can view and edit their profile.
- Should display user info
- Should allow edits

## User Settings
Users can configure their preferences.
- Should toggle notifications
- Should change theme

## Admin Panel
Admins can manage all users.
- Should list users
- Should ban users
`;
    const indicators = createMockIndicators();

    const proposal = generateSplitProposal(specContent, indicators, 'user-management.spec.md');

    expect(proposal.originalFile).toBe('user-management.spec.md');
    expect(proposal.reason).toBeDefined();
    expect(proposal.reason.length).toBeGreaterThan(0);
    expect(proposal.proposedSpecs).toBeDefined();
    expect(proposal.proposedSpecs.length).toBeGreaterThan(0);
  });

  it('generates kebab-case filenames', () => {
    const specContent = `# System Spec

## User Authentication System
Authentication features.
- Should validate

## API Integration Layer
Integration features.
- Should connect
`;
    const indicators = createMockIndicators({
      featureDomains: ['User Authentication System', 'API Integration Layer'],
    });

    const proposal = generateSplitProposal(specContent, indicators, 'system.spec.md');

    for (const spec of proposal.proposedSpecs) {
      expect(spec.filename).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+\.md$/);
      expect(spec.filename).not.toMatch(/[A-Z]/);
      expect(spec.filename).not.toMatch(/\s/);
    }
  });

  it('includes estimated stories for each proposal', () => {
    const specContent = `# Feature Spec

## User Management
- Users can register
- Users can login
- Should validate email

## Order Processing
- Users can create orders
- Users can cancel orders
- Should track status
`;
    const indicators = createMockIndicators({
      featureDomains: ['User Management', 'Order Processing'],
    });

    const proposal = generateSplitProposal(specContent, indicators, 'features.md');

    for (const spec of proposal.proposedSpecs) {
      expect(spec.estimatedStories).toBeDefined();
      expect(typeof spec.estimatedStories).toBe('number');
      expect(spec.estimatedStories).toBeGreaterThanOrEqual(1);
    }
  });

  it('includes section references for each proposal', () => {
    const specContent = `# Platform Spec

## Authentication Module
Login and registration features.
- Should validate

## Dashboard Module
Main user dashboard.
- Should display

## Settings Module
User preferences.
- Should save
`;
    const indicators = createMockIndicators({
      featureDomains: ['Authentication Module', 'Dashboard Module', 'Settings Module'],
    });

    const proposal = generateSplitProposal(specContent, indicators, 'platform.md');

    for (const spec of proposal.proposedSpecs) {
      expect(spec.sections).toBeDefined();
      expect(Array.isArray(spec.sections)).toBe(true);
      expect(spec.sections.length).toBeGreaterThan(0);
      for (const section of spec.sections) {
        expect(typeof section).toBe('string');
        expect(section.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('generateFilename', () => {
  it('generates correct filename pattern from basename and feature', () => {
    const testCases = [
      { basename: 'spec', feature: 'User Authentication', expected: 'spec.user-authentication.md' },
      { basename: 'my-feature', feature: 'Admin Panel', expected: 'my-feature.admin-panel.md' },
      { basename: 'system', feature: 'API Integration', expected: 'system.api-integration.md' },
      { basename: 'feature', feature: 'The Main Feature', expected: 'feature.main-feature.md' },
      { basename: 'app', feature: 'User Profile Settings Page', expected: 'app.user-profile-settings.md' },
    ];

    for (const { basename, feature, expected } of testCases) {
      const result = generateFilename(basename, feature);
      expect(result).toBe(expected);
    }
  });
});
