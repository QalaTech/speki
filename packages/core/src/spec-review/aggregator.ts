import type {
  FocusedPromptResult,
  SpecReviewResult,
  SpecReviewVerdict,
  SpecReviewCategory,
  SuggestionCard,
  SplitProposal,
  CodebaseContext,
} from '../types/index.js';

/**
 * Verdict priority order (highest to lowest).
 * Used to determine the overall verdict when aggregating multiple prompt results.
 */
const VERDICT_PRIORITY: Record<SpecReviewVerdict, number> = {
  SPLIT_RECOMMENDED: 4,
  FAIL: 3,
  NEEDS_IMPROVEMENT: 2,
  PASS: 1,
};

/**
 * Severity priority order for sorting suggestions.
 * Higher number = higher priority (critical first).
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

/**
 * Determines the highest priority verdict from an array of verdicts.
 */
function getHighestPriorityVerdict(verdicts: SpecReviewVerdict[]): SpecReviewVerdict {
  if (verdicts.length === 0) {
    return 'PASS';
  }

  return verdicts.reduce((highest, current) =>
    VERDICT_PRIORITY[current] > VERDICT_PRIORITY[highest] ? current : highest
  );
}

/**
 * Sorts suggestions by severity (critical > warning > info).
 */
function sortSuggestionsBySeverity(suggestions: SuggestionCard[]): SuggestionCard[] {
  return [...suggestions].sort((a, b) => {
    const priorityA = SEVERITY_PRIORITY[a.severity] ?? 0;
    const priorityB = SEVERITY_PRIORITY[b.severity] ?? 0;
    return priorityB - priorityA;
  });
}

/**
 * Extracts the split proposal from prompt results, if present.
 * Looks for results from god spec detection that have a SPLIT_RECOMMENDED verdict.
 */
function extractSplitProposal(
  results: FocusedPromptResult[],
  originalFile: string
): SplitProposal | undefined {
  const godSpecResult = results.find(
    (r) => r.verdict === 'SPLIT_RECOMMENDED' && r.promptName.toLowerCase().includes('god')
  );

  if (!godSpecResult) {
    return undefined;
  }

  const splitSuggestion = godSpecResult.suggestions.find(
    (s) => s.category.toLowerCase().includes('split') || s.issue.toLowerCase().includes('split')
  );

  const reason = splitSuggestion?.issue
    ?? godSpecResult.issues[0]
    ?? 'Spec detected as too large or complex';

  return {
    originalFile,
    reason,
    proposedSpecs: [],
  };
}

/**
 * Builds categorized results from prompt results.
 * Groups issues by prompt category/name.
 */
function buildCategories(results: FocusedPromptResult[]): Record<string, SpecReviewCategory> {
  const categories: Record<string, SpecReviewCategory> = {};

  for (const result of results) {
    const categoryKey = result.category || result.promptName;
    categories[categoryKey] = {
      verdict: result.verdict,
      issues: result.issues,
    };
  }

  return categories;
}

/**
 * Aggregates results from multiple focused prompts into a single SpecReviewResult.
 *
 * Verdict priority (highest to lowest):
 * - SPLIT_RECOMMENDED: If god spec detected
 * - FAIL: If any prompt returned critical failure
 * - NEEDS_IMPROVEMENT: If non-critical issues found
 * - PASS: If all prompts passed
 *
 * @param results - Array of FocusedPromptResult from each focused prompt
 * @param codebaseContext - Context information about the codebase
 * @param logPath - Path to the review log file
 * @param originalFile - Path to the original spec file (for split proposals)
 * @returns Aggregated SpecReviewResult
 */
export function aggregateResults(
  results: FocusedPromptResult[],
  codebaseContext: CodebaseContext,
  logPath: string,
  originalFile: string = ''
): SpecReviewResult {
  // Determine overall verdict using priority
  const verdicts = results.map((r) => r.verdict);
  const verdict = getHighestPriorityVerdict(verdicts);

  // Build categorized results
  const categories = buildCategories(results);

  // Collect and sort all suggestions by severity
  const allSuggestions = results.flatMap((r) => r.suggestions);
  const sortedSuggestions = sortSuggestionsBySeverity(allSuggestions);

  // Extract split proposal if verdict is SPLIT_RECOMMENDED
  const splitProposal =
    verdict === 'SPLIT_RECOMMENDED' ? extractSplitProposal(results, originalFile) : undefined;

  // Calculate total duration
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    verdict,
    categories,
    splitProposal,
    codebaseContext,
    suggestions: sortedSuggestions,
    logPath,
    durationMs: totalDuration,
  };
}
