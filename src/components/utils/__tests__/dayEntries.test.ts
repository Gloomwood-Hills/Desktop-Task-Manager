import { describe, expect, it } from 'vitest';
import { dedupeDayEntries } from '../dayEntries';

describe('dedupeDayEntries', () => {
  it('keeps a subtask once and preserves its parent label', () => {
    const duplicate = { task: { id: 'child-1', title: '提交清单' } };
    const nested = { task: { id: 'child-1', title: '提交清单' }, parentTitle: '更新文献' };

    expect(dedupeDayEntries([duplicate, nested])).toEqual([nested]);
  });

  it('keeps unrelated tasks in their original order', () => {
    const first = { task: { id: 'task-1' } };
    const second = { task: { id: 'task-2' } };

    expect(dedupeDayEntries([first, second])).toEqual([first, second]);
  });
});
