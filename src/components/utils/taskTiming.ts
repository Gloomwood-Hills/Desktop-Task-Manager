import { formatDeadline } from './formatDate';
import { REMINDER_OFFSET_OPTIONS } from '../../data/reminderOffsets';

export type DeferTarget = 'tonight' | 'tomorrow' | 'nextWorkday' | 'nextMonday';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 将任务延后到一个可预期的本地时刻；所有日期计算均用本地日历，避免 UTC 跨日。 */
export function deferredDeadline(
  target: DeferTarget,
  defaultHour: number,
  defaultMinute: number,
  now = new Date(),
): number {
  const next = new Date(now);
  next.setSeconds(0, 0);

  if (target === 'tonight') {
    next.setHours(defaultHour, defaultMinute, 0, 0);
    // 默认时刻已过时，“今晚”仍指当天；用户可在编辑中精确调整。
    return next.getTime();
  }

  if (target === 'tomorrow') {
    next.setDate(next.getDate() + 1);
  } else if (target === 'nextWorkday') {
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() === 0 || next.getDay() === 6);
  } else {
    const daysUntilMonday = ((8 - next.getDay()) % 7) || 7;
    next.setDate(next.getDate() + daysUntilMonday);
  }
  next.setHours(defaultHour, defaultMinute, 0, 0);
  return next.getTime();
}

export function deferTargetLabel(target: DeferTarget): string {
  return ({ tonight: '今晚', tomorrow: '明天', nextWorkday: '下个工作日', nextMonday: '下周一' })[target];
}

/** 绝对提醒跟随任务平移；相对提醒不存绝对值，会由 TaskService 根据新截止自动派生。 */
export function shiftReminderTimes(reminderTimes: number[], previousDeadline: number | null, nextDeadline: number): number[] {
  if (previousDeadline === null) return reminderTimes;
  const delta = nextDeadline - previousDeadline;
  return reminderTimes.map((time) => time + delta);
}

export function timingConfirmation(
  deadline: number | null,
  reminderOffsets: string[] = [],
  reminderTimes: number[] = [],
): string {
  const pieces = [deadline === null ? '未设置截止时间' : `已设为：${formatDeadline(deadline)}`];
  const offsetLabels = reminderOffsets
    .map((key) => REMINDER_OFFSET_OPTIONS.find((option) => option.key === key)?.label)
    .filter((label): label is string => Boolean(label));
  if (offsetLabels.length) pieces.push(`${offsetLabels.join('、')}提醒`);
  if (reminderTimes.length) pieces.push(`提醒：${reminderTimes.map(formatDeadline).join('、')}`);
  return pieces.join('，');
}

export const DAY = DAY_MS;
