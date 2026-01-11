import { describe, it, expect } from 'vitest';
import { calculateLoopLimit } from '../loop-limit.js';

describe('calculateLoopLimit', () => {
  it('calculateLoopLimit_With10ExistingTasks_Returns12', () => {
    expect(calculateLoopLimit(10)).toBe(12);
  });

  it('calculateLoopLimit_With20Existing5New_Returns30', () => {
    expect(calculateLoopLimit(20, 5)).toBe(30);
  });

  it('calculateLoopLimit_With0Tasks_Returns0', () => {
    expect(calculateLoopLimit(0)).toBe(0);
  });

  it('calculateLoopLimit_WithFractionalResult_RoundsUp', () => {
    // 7 * 1.2 = 8.4, should round up to 9
    expect(calculateLoopLimit(7)).toBe(9);
  });
});
