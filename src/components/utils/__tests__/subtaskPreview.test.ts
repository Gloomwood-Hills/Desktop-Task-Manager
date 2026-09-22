import { describe, expect, it } from 'vitest';
import { TaskWithSubtasks } from '../../../data/types';
import { closestDeadlineSubtask } from '../subtaskPreview';

const now = new Date('2026-09-22T12:00:00').getTime();

function task(id: string, deadline: number | null, completed = false): TaskWithSubtasks {
  return {
    id, title: id, remark: '', folderId: null, parentId: 'parent', startDate: null, deadline,
    priority: 'normal', sortOrder: 0, completed, completedAt: completed ? now : null, deleted: false,
    reminderAt: null, reminderFired: false, reminderOffsets: [], reminderFiredOffsets: [],
    reminderTimes: [], reminderFiredTimes: [], repeatRule: null, repeatIntervalDays: null,
    repeatSeriesId: null, repeatNextId: null, createdAt: now, updatedAt: now, subtasks: [],
  };
}

describe('closestDeadlineSubtask', () => {
  it('chooses the direct subtask whose deadline is closest to now', () => {
    const result = closestDeadlineSubtask([
      task('later', now + 3 * 24 * 60 * 60 * 1000),
      task('nearest', now + 2 * 60 * 60 * 1000),
      task('undated', null),
    ], now);

    expect(result?.id).toBe('nearest');
  });

  it('falls back to the first subtask when none has a deadline', () => {
    expect(closestDeadlineSubtask([task('first', null), task('second', null)], now)?.id).toBe('first');
  });

  it('skips completed subtasks even when their deadlines are closer', () => {
    const result = closestDeadlineSubtask([
      task('completed-nearest', now + 10 * 60 * 1000, true),
      task('active', now + 2 * 60 * 60 * 1000),
    ], now);

    expect(result?.id).toBe('active');
  });

  it('does not show a preview when every subtask is completed', () => {
    expect(closestDeadlineSubtask([task('done', now, true)], now)).toBeNull();
  });

  it('returns null for a task without subtasks', () => {
    expect(closestDeadlineSubtask([], now)).toBeNull();
  });
});
