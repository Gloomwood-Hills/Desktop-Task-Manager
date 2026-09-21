import { describe, expect, it } from 'vitest';
import { buildReminderNotification } from '../reminderNotifications';

describe('buildReminderNotification', () => {
  it('uses the task title and preserves a readable remark', () => {
    expect(buildReminderNotification({ title: '提交报告', remark: '  核对数据\n发送导师  ' })).toEqual({
      title: '任务提醒 · 提交报告',
      body: '核对数据 发送导师',
    });
  });

  it('uses a clear fallback when no remark exists', () => {
    expect(buildReminderNotification({ title: '提交报告', remark: '  ' })).toEqual({
      title: '任务提醒 · 提交报告',
      body: '提醒时间已到',
    });
  });
});
