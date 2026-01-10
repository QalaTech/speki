/**
 * Loop Limit Calculator
 *
 * Calculates the dynamic loop limit based on task count with a 20% buffer.
 */

/**
 * Calculate the loop limit based on task count.
 * Formula: ceil((existingTasks + newTasks) * 1.2)
 *
 * @param existingTasks - Number of tasks already in the PRD
 * @param newTasks - Number of new tasks being added (default: 0)
 * @returns The calculated loop limit
 */
export function calculateLoopLimit(existingTasks: number, newTasks: number = 0): number {
  const totalTasks = existingTasks + newTasks;

  // Minimum of 5 iterations even for small task counts
  if (totalTasks === 0) {
    return 5;
  }

  // Apply 20% buffer and round up
  return Math.ceil(totalTasks * 1.2);
}
