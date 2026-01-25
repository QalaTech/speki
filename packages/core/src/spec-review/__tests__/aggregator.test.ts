import { describe, it, expect } from 'vitest';
import { aggregateResults } from '../aggregator.js';
import type {
  FocusedPromptResult,
  CodebaseContext,
  SuggestionCard,
} from '../../types/index.js';

const mockCodebaseContext: CodebaseContext = {
  projectType: 'typescript',
  existingPatterns: ['ESM modules', 'Vitest for testing'],
  relevantFiles: ['src/index.ts'],
};

function createMockSuggestion(overrides: Partial<SuggestionCard> = {}): SuggestionCard {
  return {
    id: 'suggestion-1',
    category: 'clarity',
    severity: 'warning',
    section: 'Requirements',
    textSnippet: 'Some text',
    issue: 'Issue description',
    suggestedFix: 'Suggested fix',
    status: 'pending',
    ...overrides,
  };
}

function createMockResult(overrides: Partial<FocusedPromptResult> = {}): FocusedPromptResult {
  return {
    promptName: 'test-prompt',
    category: 'test-category',
    verdict: 'PASS',
    issues: [],
    suggestions: [],
    durationMs: 1000,
    ...overrides,
  };
}

describe('aggregateResults', () => {
  it('aggregateResults_AllPass_ReturnsPass', () => {
    const results: FocusedPromptResult[] = [
      createMockResult({
        promptName: 'clarity',
        category: 'clarity',
        verdict: 'PASS',
      }),
      createMockResult({
        promptName: 'completeness',
        category: 'completeness',
        verdict: 'PASS',
      }),
      createMockResult({
        promptName: 'testability',
        category: 'testability',
        verdict: 'PASS',
      }),
    ];

    const result = aggregateResults(results, mockCodebaseContext, '/logs/review.log');

    expect(result.verdict).toBe('PASS');
    expect(result.splitProposal).toBeUndefined();
  });

  it('aggregateResults_OneNeedsImprovement_ReturnsNeedsImprovement', () => {
    const results: FocusedPromptResult[] = [
      createMockResult({
        promptName: 'clarity',
        category: 'clarity',
        verdict: 'NEEDS_IMPROVEMENT',
        issues: ['Some terms are ambiguous'],
        suggestions: [
          createMockSuggestion({
            severity: 'warning',
            issue: 'Term "user" is not clearly defined',
          }),
        ],
      }),
      createMockResult({
        promptName: 'completeness',
        category: 'completeness',
        verdict: 'PASS',
      }),
    ];

    const result = aggregateResults(results, mockCodebaseContext, '/logs/review.log');

    expect(result.verdict).toBe('NEEDS_IMPROVEMENT');
  });

  it('aggregateResults_OneFail_ReturnsFail', () => {
    const results: FocusedPromptResult[] = [
      createMockResult({
        promptName: 'completeness',
        category: 'completeness',
        verdict: 'FAIL',
        issues: ['Missing critical requirements'],
        suggestions: [
          createMockSuggestion({
            severity: 'critical',
            issue: 'No acceptance criteria defined',
          }),
        ],
      }),
      createMockResult({
        promptName: 'clarity',
        category: 'clarity',
        verdict: 'PASS',
      }),
    ];

    const result = aggregateResults(results, mockCodebaseContext, '/logs/review.log');

    expect(result.verdict).toBe('FAIL');
    expect(result.categories['completeness'].verdict).toBe('FAIL');
    expect(result.categories['completeness'].issues).toContain('Missing critical requirements');
  });

  it('aggregateResults_SplitRecommended_ReturnsSplitRecommended', () => {
    const results: FocusedPromptResult[] = [
      createMockResult({
        promptName: 'god-spec-detection',
        category: 'god-spec',
        verdict: 'SPLIT_RECOMMENDED',
        issues: ['Spec covers too many features'],
        suggestions: [
          createMockSuggestion({
            category: 'split',
            issue: 'Spec should be split into smaller focused specs',
          }),
        ],
      }),
      createMockResult({
        promptName: 'clarity',
        category: 'clarity',
        verdict: 'PASS',
      }),
    ];

    const result = aggregateResults(results, mockCodebaseContext, '/logs/review.log', 'spec.md');

    expect(result.verdict).toBe('SPLIT_RECOMMENDED');
    expect(result.splitProposal).toBeDefined();
    expect(result.splitProposal?.originalFile).toBe('spec.md');
  });

  it('aggregateResults_FailAndSplitRecommended_ReturnsSplitRecommended', () => {
    // SPLIT_RECOMMENDED should win over FAIL
    const results: FocusedPromptResult[] = [
      createMockResult({
        promptName: 'god-spec-detection',
        category: 'god-spec',
        verdict: 'SPLIT_RECOMMENDED',
        issues: ['Too large'],
      }),
      createMockResult({
        promptName: 'completeness',
        category: 'completeness',
        verdict: 'FAIL',
        issues: ['Missing requirements'],
      }),
      createMockResult({
        promptName: 'clarity',
        category: 'clarity',
        verdict: 'NEEDS_IMPROVEMENT',
        issues: ['Some ambiguity'],
      }),
      createMockResult({
        promptName: 'testability',
        category: 'testability',
        verdict: 'PASS',
      }),
    ];

    const result = aggregateResults(results, mockCodebaseContext, '/logs/review.log', 'spec.md');

    expect(result.verdict).toBe('SPLIT_RECOMMENDED');
    expect(result.categories['god-spec'].verdict).toBe('SPLIT_RECOMMENDED');
    expect(result.categories['completeness'].verdict).toBe('FAIL');
    expect(result.categories['clarity'].verdict).toBe('NEEDS_IMPROVEMENT');
    expect(result.categories['testability'].verdict).toBe('PASS');
  });

  it('aggregateResults_CombinesIssuesFromAllPrompts', () => {
    const results: FocusedPromptResult[] = [
      createMockResult({
        promptName: 'clarity',
        category: 'clarity',
        verdict: 'NEEDS_IMPROVEMENT',
        issues: ['Ambiguous term: user', 'Missing definition: workflow'],
      }),
      createMockResult({
        promptName: 'completeness',
        category: 'completeness',
        verdict: 'FAIL',
        issues: ['Missing acceptance criteria', 'No error handling defined'],
      }),
      createMockResult({
        promptName: 'testability',
        category: 'testability',
        verdict: 'NEEDS_IMPROVEMENT',
        issues: ['No observable outcomes'],
      }),
    ];

    const result = aggregateResults(results, mockCodebaseContext, '/logs/review.log');

    expect(result.categories['clarity'].issues).toEqual([
      'Ambiguous term: user',
      'Missing definition: workflow',
    ]);
    expect(result.categories['completeness'].issues).toEqual([
      'Missing acceptance criteria',
      'No error handling defined',
    ]);
    expect(result.categories['testability'].issues).toEqual(['No observable outcomes']);
  });

  it('aggregateResults_SortsSuggestionsBySeverity', () => {
    const results: FocusedPromptResult[] = [
      createMockResult({
        promptName: 'prompt1',
        category: 'cat1',
        verdict: 'NEEDS_IMPROVEMENT',
        suggestions: [
          createMockSuggestion({ id: 'info-1', severity: 'info', issue: 'Info issue' }),
          createMockSuggestion({ id: 'warning-1', severity: 'warning', issue: 'Warning issue' }),
        ],
      }),
      createMockResult({
        promptName: 'prompt2',
        category: 'cat2',
        verdict: 'FAIL',
        suggestions: [
          createMockSuggestion({ id: 'critical-1', severity: 'critical', issue: 'Critical issue' }),
          createMockSuggestion({ id: 'info-2', severity: 'info', issue: 'Another info' }),
        ],
      }),
    ];

    const result = aggregateResults(results, mockCodebaseContext, '/logs/review.log');

    // Sorted by severity: critical > warning > info
    expect(result.suggestions).toHaveLength(4);
    expect(result.suggestions[0].severity).toBe('critical');
    expect(result.suggestions[1].severity).toBe('warning');
    expect(result.suggestions[2].severity).toBe('info');
    expect(result.suggestions[3].severity).toBe('info');
  });
});
