/** 提前提醒偏移配置：相对截止时间的提前量，用于"提醒时间"的多选预设。
 * 存储偏移的 key 而非绝对的提醒时刻，这样截止时间改变时提醒自动联动顺延。 */

export type ReminderOffsetKey = '1d' | '3d' | '6h';

export interface ReminderOffsetOption {
  key: ReminderOffsetKey;
  label: string;
  ms: number;
}

export const REMINDER_OFFSET_OPTIONS: ReminderOffsetOption[] = [
  { key: '1d', label: '提前一天', ms: 24 * 60 * 60 * 1000 },
  { key: '3d', label: '提前三天', ms: 3 * 24 * 60 * 60 * 1000 },
  { key: '6h', label: '提前6小时', ms: 6 * 60 * 60 * 1000 },
];

export function isReminderOffsetKey(key: string): key is ReminderOffsetKey {
  return REMINDER_OFFSET_OPTIONS.some((o) => o.key === key);
}

/** 清理偏移配置：仅保留合法 key，去重，保持配置顺序 */
export function sanitizeOffsets(input?: string[] | null): ReminderOffsetKey[] {
  if (!input) return [];
  return Array.from(
    new Set(input.filter((k): k is ReminderOffsetKey => isReminderOffsetKey(k)))
  );
}

/** 清理绝对提醒时刻（毫秒时间戳）：仅保留合法有限数字，去重，升序排列 */
export function sanitizeTimes(input?: number[] | null): number[] {
  if (!input) return [];
  return Array.from(
    new Set(input.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))
  ).sort((a, b) => a - b);
}

export function offsetMs(key: ReminderOffsetKey): number {
  const opt = REMINDER_OFFSET_OPTIONS.find((o) => o.key === key);
  return opt ? opt.ms : 0;
}

/** 截止时间对应的各偏移提醒绝对时刻（升序，最早在前） */
export function offsetReminderTimes(deadline: number, offsets: string[]): { key: ReminderOffsetKey; time: number }[] {
  return offsets
    .filter((k): k is ReminderOffsetKey => isReminderOffsetKey(k))
    .map((k) => ({ key: k, time: deadline - offsetMs(k) }))
    .sort((a, b) => a.time - b.time);
}

/** 派生 reminderAt：取最早的一个偏移提醒时刻；无偏移或未设截止返回 null */
export function deriveReminderAt(deadline: number | null, offsets: string[]): number | null {
  if (deadline == null) return null;
  const times = offsetReminderTimes(deadline, offsets);
  return times.length ? times[0].time : null;
}
