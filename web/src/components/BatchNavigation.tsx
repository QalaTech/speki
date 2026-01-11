import React from 'react';
import type { SuggestionCard } from '../../../src/types/index.js';
import './BatchNavigation.css';

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

  // Don't render if no suggestions
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

  return (
    <div className="batch-navigation" data-testid="batch-navigation">
      <div className="batch-nav-left">
        <button
          className="batch-nav-btn"
          onClick={handlePrevious}
          disabled={!hasPrevious || disabled}
          data-testid="prev-btn"
          aria-label="Previous suggestion"
        >
          Previous
        </button>

        <span className="batch-nav-counter" data-testid="nav-counter">
          Suggestion {currentIndex + 1} of {total}
        </span>

        <button
          className="batch-nav-btn"
          onClick={handleNext}
          disabled={!hasNext || disabled}
          data-testid="next-btn"
          aria-label="Next suggestion"
        >
          Next
        </button>
      </div>

      <div className="batch-nav-right">
        <button
          className="batch-action-btn reject-all-btn"
          onClick={onRejectAll}
          disabled={disabled}
          data-testid="reject-all-btn"
        >
          Reject All
        </button>

        <button
          className="batch-action-btn approve-all-btn"
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
