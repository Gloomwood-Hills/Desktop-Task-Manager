import { describe, expect, it } from 'vitest';
import type { TaskWithSubtasks } from '../../../data/types';
import { selectTodayFocus } from '../focusTasks';

const now = new Date(2026, 8, 22, 10).getTime();
const task = (id: string, deadline: number | null, priority: 'normal' | 'important' = 'normal'): TaskWithSubtasks => ({
  id, title: id, remark: '', folderId: null, parentId: null, startDate: null, deadline, priority, sortOrder: 0,
  completed: false, completedAt: null, deleted: false, reminderAt: null, reminderFired: false,
  reminderOffsets: [], reminderFiredOffsets: [], reminderTimes: [], reminderFiredTimes: [], repeatRule: null,
  repeatIntervalDays: null, repeatSeriesId: null, repeatNextId: null, createdAt: now, updatedAt: now, subtasks: [],
});

describe('today focus selection', () => {
  it('orders overdue, today, then important and removes duplicates', () => {
    const todayLate = new Date(2026, 8, 22, 18).getTime();
    const overdue = new Date(2026, 8, 21, 18).getTime();
    const selected = selectTodayFocus([
      task('important', todayLate, 'important'), task('overdue', overdue), task('today', todayLate), task('later-important', new Date(2026, 8, 25).getTime(), 'important'),
    ], now);
    expect(selected.map((item) => item.id)).toEqual(['overdue', 'important', 'today', 'later-important']);
  });
});
