/**
 * In-memory tracking of active review sessions.
 *
 * When the server restarts, this set is empty. If a persisted session claims
 * `in_progress` but its ID isn't in this set, the review is stale (the server
 * crashed or restarted while it was running).
 */
const activeReviews = new Set<string>();

export function registerActiveReview(sessionId: string): void {
  activeReviews.add(sessionId);
}

export function unregisterActiveReview(sessionId: string): void {
  activeReviews.delete(sessionId);
}

export function isReviewActive(sessionId: string): boolean {
  return activeReviews.has(sessionId);
}
