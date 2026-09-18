import { describe, expect, it } from 'vitest';
import { formatTaskClipboardText } from '../clipboard';

describe('formatTaskClipboardText', () => {
  it('copies a task title and its multiline remark', () => {
    expect(formatTaskClipboardText({ title: '整理报告', remark: '核对数据\n补充结论' }))
      .toBe('任务：整理报告\n备注：核对数据\n补充结论');
  });

  it('makes an empty remark explicit', () => {
    expect(formatTaskClipboardText({ title: '整理报告', remark: '   ' }))
      .toBe('任务：整理报告\n备注：无备注');
  });
});
