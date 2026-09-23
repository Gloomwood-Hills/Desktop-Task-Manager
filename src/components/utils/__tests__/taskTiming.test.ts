import { describe, expect, it } from 'vitest';
import { deferredDeadline, shiftReminderTimes, timingConfirmation } from '../taskTiming';

const at = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();

describe('task timing helpers', () => {
  it('skips the weekend for the next workday', () => {
    const friday = new Date(2026, 8, 25, 10, 0);
    expect(deferredDeadline('nextWorkday', 18, 0, friday)).toBe(at(2026, 9, 28, 18));
  });

  it('uses the next Monday rather than the current Monday', () => {
    const monday = new Date(2026, 8, 21, 10, 0);
    expect(deferredDeadline('nextMonday', 18, 0, monday)).toBe(at(2026, 9, 28, 18));
  });

  it('moves absolute reminders by the same amount as the deadline', () => {
    const oldDeadline = at(2026, 9, 22, 18);
    const newDeadline = at(2026, 9, 23, 18);
    expect(shiftReminderTimes([at(2026, 9, 22, 9)], oldDeadline, newDeadline)).toEqual([at(2026, 9, 23, 9)]);
  });

  it('states the final persisted time and reminder configuration', () => {
    expect(timingConfirmation(at(2026, 9, 23, 18), ['1d'])).toContain('提前一天提醒');
    expect(timingConfirmation(null)).toBe('未设置截止时间');
  });
});
