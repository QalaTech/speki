import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractReviewJson,
  validateFocusedPromptResult,
  validateGodSpecResult,
  validateSplitProposal,
} from '../spec-review/json-parser.js';
import type { FocusedPromptResult, SuggestionCard } from '../types/index.js';

// Helper to create a valid suggestion card for tests
function createValidSuggestionCard(overrides: Partial<SuggestionCard> = {}): SuggestionCard {
  return {
    id: 'sug-1',
    category: 'clarity',
    severity: 'warning',
    section: 'Introduction',
    textSnippet: 'The system shall...',
    issue: 'Ambiguous requirement',
    suggestedFix: 'Be more specific',
    status: 'pending',
    ...overrides,
  };
}

// Helper to create a valid FocusedPromptResult for tests
function createValidFocusedPromptResult(
  overrides: Partial<FocusedPromptResult> = {}
): FocusedPromptResult {
  return {
    promptName: 'clarity_check',
    category: 'clarity',
    verdict: 'PASS',
    issues: [],
    suggestions: [],
    durationMs: 1500,
    ...overrides,
  };
}

describe('extractReviewJson', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('extractReviewJson_WithMarkdownCodeBlock_ShouldExtractJson', () => {
    // Arrange
    const input = `Here is the analysis:

\`\`\`json
{"verdict": "PASS", "issues": []}
\`\`\`

That concludes the review.`;

    // Act
    const result = extractReviewJson<{ verdict: string; issues: string[] }>(input);

    // Assert
    expect(result).toEqual({ verdict: 'PASS', issues: [] });
  });

  it('extractReviewJson_WithRawJson_ShouldParse', () => {
    // Arrange
    const input = '{"verdict": "FAIL", "issues": ["Missing requirement"]}';

    // Act
    const result = extractReviewJson<{ verdict: string; issues: string[] }>(input);

    // Assert
    expect(result).toEqual({ verdict: 'FAIL', issues: ['Missing requirement'] });
  });

  it('extractReviewJson_WithProseAndJson_ShouldExtractJsonOnly', () => {
    // Arrange
    const input = `After careful analysis of the specification, I have identified several issues.

The requirements appear incomplete. Here is my structured feedback:

{"verdict": "NEEDS_IMPROVEMENT", "issues": ["Unclear scope", "Missing edge cases"], "suggestions": []}

I hope this helps improve the specification.`;

    // Act
    const result = extractReviewJson<{ verdict: string; issues: string[]; suggestions: unknown[] }>(
      input
    );

    // Assert
    expect(result).toEqual({
      verdict: 'NEEDS_IMPROVEMENT',
      issues: ['Unclear scope', 'Missing edge cases'],
      suggestions: [],
    });
  });

  it('extractReviewJson_WithInvalidJson_ShouldReturnNull', () => {
    // Arrange
    const input = 'This is not valid JSON at all {broken';

    // Act
    const result = extractReviewJson(input);

    // Assert
    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[json-parser] Failed to extract JSON from output:',
      input
    );
  });
});

describe('validateFocusedPromptResult', () => {
  it('validateFocusedPromptResult_WithValidResult_ShouldReturnTrue', () => {
    // Arrange
    const validResult = createValidFocusedPromptResult({
      suggestions: [createValidSuggestionCard()],
      issues: ['Minor issue found'],
    });

    // Act
    const isValid = validateFocusedPromptResult(validResult);

    // Assert
    expect(isValid).toBe(true);
  });

  it('validateFocusedPromptResult_WithMissingFields_ShouldReturnFalse', () => {
    // Arrange - missing required 'verdict' field
    const invalidResult = {
      promptName: 'test_prompt',
      category: 'clarity',
      // verdict: missing
      issues: [],
      suggestions: [],
      durationMs: 1000,
    };

    // Act
    const isValid = validateFocusedPromptResult(invalidResult);

    // Assert
    expect(isValid).toBe(false);
  });

  it('validateFocusedPromptResult_WithNullInput_ShouldReturnFalse', () => {
    expect(validateFocusedPromptResult(null)).toBe(false);
  });

  it('validateFocusedPromptResult_WithInvalidVerdict_ShouldReturnFalse', () => {
    const invalidResult = createValidFocusedPromptResult();
    (invalidResult as unknown as Record<string, unknown>).verdict = 'INVALID';
    expect(validateFocusedPromptResult(invalidResult)).toBe(false);
  });

  it('validateFocusedPromptResult_WithInvalidSuggestions_ShouldReturnFalse', () => {
    const invalidResult = {
      ...createValidFocusedPromptResult(),
      suggestions: [{ invalid: 'suggestion' }],
    };
    expect(validateFocusedPromptResult(invalidResult)).toBe(false);
  });
});

describe('validateGodSpecResult', () => {
  it('validateGodSpecResult_WithSplitProposal_ShouldValidateNestedStructure', () => {
    // Arrange
    const godSpecResult = {
      ...createValidFocusedPromptResult({
        verdict: 'SPLIT_RECOMMENDED',
      }),
      godSpecIndicators: {
        isGodSpec: true,
        indicators: ['Multiple domains', 'Too many stories'],
        estimatedStories: 25,
        featureDomains: ['auth', 'payments', 'notifications'],
        systemBoundaries: ['API', 'Database', 'Queue'],
      },
      splitProposal: {
        originalFile: 'spec.md',
        reason: 'Too many feature domains',
        proposedSpecs: [
          {
            filename: 'auth-spec.md',
            description: 'Authentication features',
            estimatedStories: 8,
            sections: ['Login', 'Registration', 'Password Reset'],
          },
          {
            filename: 'payments-spec.md',
            description: 'Payment processing',
            estimatedStories: 10,
            sections: ['Checkout', 'Refunds', 'Invoices'],
          },
        ],
      },
    };

    // Act
    const isValid = validateGodSpecResult(godSpecResult);

    // Assert
    expect(isValid).toBe(true);
  });

  it('validateGodSpecResult_WithInvalidBase_ShouldReturnFalse', () => {
    const invalidResult = { invalid: 'data' };
    expect(validateGodSpecResult(invalidResult)).toBe(false);
  });

  it('validateGodSpecResult_WithInvalidGodSpecIndicators_ShouldReturnFalse', () => {
    const invalidResult = {
      ...createValidFocusedPromptResult(),
      godSpecIndicators: { isGodSpec: 'not-a-boolean' },
    };
    expect(validateGodSpecResult(invalidResult)).toBe(false);
  });

  it('validateGodSpecResult_WithInvalidSplitProposal_ShouldReturnFalse', () => {
    const invalidResult = {
      ...createValidFocusedPromptResult(),
      splitProposal: { originalFile: 123 },
    };
    expect(validateGodSpecResult(invalidResult)).toBe(false);
  });
});

describe('validateSplitProposal', () => {
  it('validateSplitProposal_WithValidSpecs_ShouldReturnTrue', () => {
    // Arrange
    const validSplitProposal = {
      originalFile: 'large-spec.md',
      reason: 'Spec covers multiple distinct domains',
      proposedSpecs: [
        {
          filename: 'user-management-spec.md',
          description: 'User authentication and profile management',
          estimatedStories: 6,
          sections: ['User Registration', 'Authentication', 'Profile Management'],
        },
        {
          filename: 'reporting-spec.md',
          description: 'Analytics and reporting features',
          estimatedStories: 4,
          sections: ['Dashboard', 'Report Generation'],
        },
      ],
    };

    // Act
    const isValid = validateSplitProposal(validSplitProposal);

    // Assert
    expect(isValid).toBe(true);
  });

  it('validateSplitProposal_WithNullInput_ShouldReturnFalse', () => {
    expect(validateSplitProposal(null)).toBe(false);
  });

  it('validateSplitProposal_WithInvalidOriginalFile_ShouldReturnFalse', () => {
    const invalid = {
      originalFile: 123,
      reason: 'test',
      proposedSpecs: [],
    };
    expect(validateSplitProposal(invalid)).toBe(false);
  });

  it('validateSplitProposal_WithInvalidProposedSpec_ShouldReturnFalse', () => {
    const invalid = {
      originalFile: 'spec.md',
      reason: 'test',
      proposedSpecs: [
        {
          filename: 'valid.md',
          description: 'Valid',
          estimatedStories: 5,
          sections: ['Section 1'],
        },
        {
          filename: 'invalid.md',
          // Missing description
          estimatedStories: 3,
          sections: [],
        },
      ],
    };
    expect(validateSplitProposal(invalid)).toBe(false);
  });

  it('validateSplitProposal_WithNonArrayProposedSpecs_ShouldReturnFalse', () => {
    const invalid = {
      originalFile: 'spec.md',
      reason: 'test',
      proposedSpecs: 'not-an-array',
    };
    expect(validateSplitProposal(invalid)).toBe(false);
  });
});
