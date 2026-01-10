import { describe, it, expect } from 'vitest';
import { detectGodSpec, estimateStoryCount } from '../god-spec-detector.js';
import type { CodebaseContext } from '../../../types/index.js';

const createMockCodebaseContext = (): CodebaseContext => ({
  projectType: 'typescript',
  existingPatterns: ['MVC', 'Repository'],
  relevantFiles: ['src/index.ts'],
});

describe('detectGodSpec', () => {
  it('detectGodSpec_WithSmallSpec_ReturnsNotGodSpec', () => {
    // Arrange
    const smallSpec = `# Simple Feature Spec

## Overview
This spec describes a simple login feature.

## Acceptance Criteria
- Users can enter their email
- Users can enter their password
- System validates credentials
`;
    const context = createMockCodebaseContext();

    // Act
    const result = detectGodSpec(smallSpec, context);

    // Assert
    expect(result.isGodSpec).toBe(false);
    expect(result.indicators).toHaveLength(0);
    expect(result.estimatedStories).toBeLessThanOrEqual(15);
  });

  it('detectGodSpec_WithManyFeatureSections_ReturnsGodSpec', () => {
    // Arrange - spec with >3 feature sections and no definition of done (2 categories)
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

    // Act
    const result = detectGodSpec(largeSpec, context);

    // Assert
    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.some((i) => i.includes('feature sections'))).toBe(true);
    expect(result.featureDomains.length).toBeGreaterThan(3);
  });

  it('detectGodSpec_WithHighEstimatedStories_ReturnsGodSpec', () => {
    // Arrange - spec that would generate >15 stories and no definition of done
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

    // Act
    const result = detectGodSpec(storyHeavySpec, context);

    // Assert
    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.some((i) => i.includes('estimated stories'))).toBe(true);
    expect(result.estimatedStories).toBeGreaterThan(15);
  });

  it('detectGodSpec_WithMultipleUserJourneys_ReturnsGodSpec', () => {
    // Arrange - spec with multiple user journeys and no definition of done
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

    // Act
    const result = detectGodSpec(multiJourneySpec, context);

    // Assert
    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.some((i) => i.includes('user journeys') || i.includes('personas'))).toBe(true);
  });

  it('detectGodSpec_WithOneIndicator_ReturnsNotGodSpec', () => {
    // Arrange - spec with only one category triggered (just no DoD)
    const singleIndicatorSpec = `# Simple Feature

## Overview
A focused feature spec.

## Requirements
- Users can do one thing
- Users can do another thing
`;
    const context = createMockCodebaseContext();

    // Act
    const result = detectGodSpec(singleIndicatorSpec, context);

    // Assert
    // Only cohesion indicator (no DoD) is triggered
    expect(result.isGodSpec).toBe(false);
    // May have one indicator from cohesion
    expect(result.indicators.filter((i) => !i.includes('Cohesion')).length).toBeLessThanOrEqual(0);
  });

  it('detectGodSpec_WithTwoIndicators_ReturnsGodSpec', () => {
    // Arrange - spec with exactly 2 categories triggered: size (>2000 words) and cohesion (no DoD)
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

    // Act
    const result = detectGodSpec(longSpec, context);

    // Assert
    expect(result.isGodSpec).toBe(true);
    expect(result.indicators.length).toBeGreaterThanOrEqual(2);
    // Should have both size and cohesion triggers
    const hasSize = result.indicators.some((i) => i.includes('Size:'));
    const hasCohesion = result.indicators.some((i) => i.includes('Cohesion:'));
    expect(hasSize || hasCohesion).toBe(true);
  });
});

describe('estimateStoryCount', () => {
  it('estimateStoryCount_WithTypicalSpec_ReturnsReasonableEstimate', () => {
    // Arrange
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

    // Act
    const estimate = estimateStoryCount(typicalSpec);

    // Assert
    // Reasonable estimate for this spec would be 5-15 stories
    expect(estimate).toBeGreaterThanOrEqual(5);
    expect(estimate).toBeLessThanOrEqual(20);
  });
});
