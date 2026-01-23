import React from 'react';
import type { SuggestionCard } from '../../../src/types/index.js';

export interface BatchNavigationProps {
  /** List of pending suggestions to navigate */
  suggestions: SuggestionCard[];
  /** Current index in the suggestions array (0-based) */
  currentIndex: number;
  /** Called when user navigates to a different suggestion */
  onNavigate: (index: number) => void;
  /** Called when user approves all pending suggestions */
  onApproveAll: () => void;
  /** Called when user rejects all pending suggestions */
  onRejectAll: () => void;
  /** Whether navigation is disabled (e.g., during loading) */
  disabled?: boolean;
}

/**
 * BatchNavigation provides controls for navigating through multiple suggestions
 * and performing batch actions (approve all, reject all).
 */
export function BatchNavigation({
  suggestions,
  currentIndex,
  onNavigate,
  onApproveAll,
  onRejectAll,
  disabled = false,
}: BatchNavigationProps): React.ReactElement | null {
  const total = suggestions.length;

  if (total === 0) {
    return null;
  }

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < total - 1;

  const handlePrevious = (): void => {
    if (hasPrevious && !disabled) {
      onNavigate(currentIndex - 1);
    }
  };

  const handleNext = (): void => {
    if (hasNext && !disabled) {
      onNavigate(currentIndex + 1);
    }
  };

  const navBtnClass = "py-1.5 px-3 text-sm font-medium text-text bg-surface border border-border rounded cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-text-muted disabled:opacity-50 disabled:cursor-not-allowed";
  const actionBtnClass = "py-1.5 px-4 text-sm font-medium border border-transparent rounded cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex justify-between items-center py-3 px-4 bg-surface border border-border rounded-md mb-4" data-testid="batch-navigation">
      <div className="flex items-center gap-3">
        <button
          className={navBtnClass}
          onClick={handlePrevious}
          disabled={!hasPrevious || disabled}
          data-testid="prev-btn"
          aria-label="Previous suggestion"
        >
          Previous
        </button>

        <span className="text-sm font-medium text-text min-w-[140px] text-center" data-testid="nav-counter">
          Suggestion {currentIndex + 1} of {total}
        </span>

        <button
          className={navBtnClass}
          onClick={handleNext}
          disabled={!hasNext || disabled}
          data-testid="next-btn"
          aria-label="Next suggestion"
        >
          Next
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          className={`${actionBtnClass} bg-red-600 border-red-600 text-white hover:bg-red-700`}
          onClick={onRejectAll}
          disabled={disabled}
          data-testid="reject-all-btn"
        >
          Reject All
        </button>

        <button
          className={`${actionBtnClass} bg-green-600 border-green-600 text-white hover:bg-green-700`}
          onClick={onApproveAll}
          disabled={disabled}
          data-testid="approve-all-btn"
        >
          Approve All
        </button>
      </div>
    </div>
  );
}
