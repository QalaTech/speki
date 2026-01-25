import type {
  FocusedPromptResult,
  GodSpecIndicators,
  SplitProposal,
  SuggestionCard,
  SpecReviewVerdict,
  SuggestionSeverity,
  SuggestionStatus,
} from '../types/index.js';

// Valid enum values for type guards
const VALID_VERDICTS = ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT', 'SPLIT_RECOMMENDED'] as const;
const VALID_SEVERITIES = ['critical', 'warning', 'info'] as const;
const VALID_STATUSES = ['pending', 'approved', 'rejected', 'edited'] as const;

/**
 * Extracts JSON from AI response text.
 * Handles various formats: markdown code blocks, raw JSON, prose mixed with JSON.
 * Returns null on complete parse failure (does not throw).
 */
export function extractReviewJson<T>(output: string): T | null {
  for (const candidate of findJsonCandidates(output)) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue to next candidate
    }
  }

  // Log raw output on parse failure for debugging
  console.error('[json-parser] Failed to extract JSON from output:', output);
  return null;
}

/**
 * Generator that yields potential JSON strings from text.
 * Tries multiple extraction strategies in order of likelihood.
 */
function* findJsonCandidates(text: string): Generator<string> {
  const trimmed = text.trim();

  // Strategy 1: Direct parse of entire text (raw JSON)
  yield trimmed;

  // Strategy 2: JSON in markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    yield codeBlockMatch[1];
  }

  // Strategy 3: Brace matching for JSON objects (handles prose mixed with JSON)
  let start = trimmed.indexOf('{');
  while (start !== -1) {
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++;
      else if (trimmed[i] === '}') {
        depth--;
        if (depth === 0) {
          yield trimmed.substring(start, i + 1);
          break;
        }
      }
    }
    start = trimmed.indexOf('{', start + 1);
  }
}

/**
 * Validates that a parsed object conforms to FocusedPromptResult schema.
 */
export function validateFocusedPromptResult(obj: unknown): obj is FocusedPromptResult {
  if (!obj || typeof obj !== 'object') return false;

  const o = obj as Record<string, unknown>;

  // Required string fields
  if (typeof o.promptName !== 'string') return false;
  if (typeof o.category !== 'string') return false;

  // Required verdict (must be valid SpecReviewVerdict)
  if (!isValidVerdict(o.verdict)) return false;

  // Required arrays
  if (!isStringArray(o.issues)) return false;

  if (!Array.isArray(o.suggestions)) return false;
  if (!o.suggestions.every(isValidSuggestionCard)) return false;

  // Required number
  if (typeof o.durationMs !== 'number') return false;

  return true;
}

/**
 * Validates god spec detection result with nested structures.
 * Checks for GodSpecIndicators and optional SplitProposal.
 */
export function validateGodSpecResult(obj: unknown): boolean {
  if (!validateFocusedPromptResult(obj)) return false;

  const o = obj as FocusedPromptResult & { godSpecIndicators?: unknown; splitProposal?: unknown };

  // Validate optional nested structures if present
  if (o.godSpecIndicators !== undefined && !isValidGodSpecIndicators(o.godSpecIndicators)) {
    return false;
  }
  if (o.splitProposal !== undefined && !validateSplitProposal(o.splitProposal)) {
    return false;
  }

  return true;
}

/**
 * Validates a SplitProposal structure.
 */
export function validateSplitProposal(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;

  const o = obj as Record<string, unknown>;

  // Required string fields
  if (typeof o.originalFile !== 'string') return false;
  if (typeof o.reason !== 'string') return false;

  // Required proposedSpecs array
  if (!Array.isArray(o.proposedSpecs)) return false;

  return o.proposedSpecs.every(isValidProposedSpec);
}

// Type guard helpers
function isValidVerdict(v: unknown): v is SpecReviewVerdict {
  return VALID_VERDICTS.includes(v as SpecReviewVerdict);
}

function isValidSeverity(s: unknown): s is SuggestionSeverity {
  return VALID_SEVERITIES.includes(s as SuggestionSeverity);
}

function isValidStatus(s: unknown): s is SuggestionStatus {
  return VALID_STATUSES.includes(s as SuggestionStatus);
}

function isStringArray(arr: unknown): arr is string[] {
  return Array.isArray(arr) && arr.every((item) => typeof item === 'string');
}

// Validation helpers
function isValidSuggestionCard(obj: unknown): obj is SuggestionCard {
  if (!obj || typeof obj !== 'object') return false;

  const o = obj as Record<string, unknown>;

  if (typeof o.id !== 'string') return false;
  if (typeof o.category !== 'string') return false;
  if (!isValidSeverity(o.severity)) return false;
  if (typeof o.section !== 'string') return false;
  if (typeof o.textSnippet !== 'string') return false;
  if (typeof o.issue !== 'string') return false;
  if (typeof o.suggestedFix !== 'string') return false;
  if (!isValidStatus(o.status)) return false;

  // Optional fields
  if (o.lineStart !== undefined && typeof o.lineStart !== 'number') return false;
  if (o.lineEnd !== undefined && typeof o.lineEnd !== 'number') return false;
  if (o.userVersion !== undefined && typeof o.userVersion !== 'string') return false;
  if (o.reviewedAt !== undefined && typeof o.reviewedAt !== 'string') return false;

  return true;
}

function isValidGodSpecIndicators(obj: unknown): obj is GodSpecIndicators {
  if (!obj || typeof obj !== 'object') return false;

  const o = obj as Record<string, unknown>;

  if (typeof o.isGodSpec !== 'boolean') return false;
  if (!isStringArray(o.indicators)) return false;
  if (typeof o.estimatedStories !== 'number') return false;
  if (!isStringArray(o.featureDomains)) return false;
  if (!isStringArray(o.systemBoundaries)) return false;

  return true;
}

function isValidProposedSpec(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;

  const o = obj as Record<string, unknown>;

  if (typeof o.filename !== 'string') return false;
  if (typeof o.description !== 'string') return false;
  if (typeof o.estimatedStories !== 'number') return false;
  if (!isStringArray(o.sections)) return false;

  return true;
}
