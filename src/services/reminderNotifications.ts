import { Task } from '../data/types';

/** 前端存活期间的提醒检查频率；回到前台时另会立即补查。 */
export const REMINDER_POLL_INTERVAL_MS = 15_000;

/** 系统通知内容：标题直指任务，备注保留为可读的简短上下文。 */
export function buildReminderNotification(task: Pick<Task, 'title' | 'remark'>): { title: string; body: string } {
  const remark = task.remark.trim().replace(/\s+/g, ' ');
  return {
    title: `任务提醒 · ${task.title}`,
    body: remark ? remark.slice(0, 140) : '提醒时间已到',
  };
}
