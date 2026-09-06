/**
 * 重复任务出现日期计算工具：
 * 给定一个带 repeatRule 的任务，计算其在 [rangeStart, rangeEnd] 区间内的所有出现时刻。
 * 用于月视图 / 日视图展示重复任务在每一天的虚拟出现（不创建新 DB 记录）。
 */

import { Task, TaskRepeatRule } from '../../data/types';

/** 计算下一次截止时间（与 TaskService.nextDeadline 保持一致） */
export function nextDeadline(deadline: number, rule: TaskRepeatRule, intervalDays: number | null): number {
  const d = new Date(deadline);
  const addDays = (n: number) => {
    const x = new Date(deadline); x.setDate(x.getDate() + n); return x.getTime();
  };
  const addMonths = (n: number) => {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d.getTime();
  };
  const addYears = (n: number) => {
    const m = d.getMonth(); const day = d.getDate();
    d.setFullYear(d.getFullYear() + n);
    const last = new Date(d.getFullYear(), m + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d.getTime();
  };
  switch (rule) {
    case 'daily': return addDays(1);
    case 'weekly': return addDays(7);
    case 'monthly': return addMonths(1);
    case 'yearly': return addYears(1);
    case 'custom': return addDays(Math.max(1, intervalDays ?? 1));
    default: return deadline;
  }
}

/** 计算上一次截止时间（向前推算，用于补全区间内已过去的出现日） */
export function prevDeadline(deadline: number, rule: TaskRepeatRule, intervalDays: number | null): number {
  const d = new Date(deadline);
  const subDays = (n: number) => {
    const x = new Date(deadline); x.setDate(x.getDate() - n); return x.getTime();
  };
  const subMonths = (n: number) => {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d.getTime();
  };
  const subYears = (n: number) => {
    const m = d.getMonth(); const day = d.getDate();
    d.setFullYear(d.getFullYear() - n);
    const last = new Date(d.getFullYear(), m + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d.getTime();
  };
  switch (rule) {
    case 'daily': return subDays(1);
    case 'weekly': return subDays(7);
    case 'monthly': return subMonths(1);
    case 'yearly': return subYears(1);
    case 'custom': return subDays(Math.max(1, intervalDays ?? 1));
    default: return deadline;
  }
}

/**
 * 生成重复任务在 [rangeStart, rangeEnd] 区间内的所有出现时刻（含端点）。
 * 以任务自身 deadline 为基准，向前/向后按重复规则迭代。
 * 返回的时刻与 deadline 同日同时分（保留任务设定的具体时刻）。
 */
export function generateRepeatOccurrences(task: Task, rangeStart: number, rangeEnd: number): number[] {
  if (!task.repeatRule || !task.deadline) return [];
  const rule = task.repeatRule;
  const interval = task.repeatIntervalDays;
  const result: number[] = [];

  // 向前迭代（从 deadline 往前，直到低于 rangeStart）
  let current = task.deadline;
  const forward: number[] = [];
  // 先把 deadline 本身加入（如果在区间内）
  if (current >= rangeStart && current <= rangeEnd) result.push(current);
  // 向后迭代
  while (current <= rangeEnd) {
    current = nextDeadline(current, rule, interval);
    if (current > rangeEnd) break;
    if (current >= rangeStart) result.push(current);
  }
  // 向前迭代
  current = task.deadline;
  while (current >= rangeStart) {
    current = prevDeadline(current, rule, interval);
    if (current < rangeStart) break;
    if (current <= rangeEnd) result.push(current);
  }

  // 去重 + 升序
  return Array.from(new Set(result)).sort((a, b) => a - b);
}
