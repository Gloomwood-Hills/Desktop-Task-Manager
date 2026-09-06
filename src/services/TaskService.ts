import Database from '@tauri-apps/plugin-sql';
import { Task, TaskWithSubtasks, Priority, TaskRepeatRule } from '../data/types';
import { TaskRepository } from '../data/repositories';
import { generateId, buildTaskTree } from '../data/utils';
import { deriveReminderAt, offsetReminderTimes, isReminderOffsetKey, sanitizeOffsets, sanitizeTimes } from '../data/reminderOffsets';

/** 提醒到期项：task + 触发来源。offsetKey 非空=对应偏移提醒；reminderTime 非空=多选绝对提醒时刻；
 * 两者皆空=旧版单次 reminderAt */
export interface DueReminder {
  task: Task;
  offsetKey: string | null;
  /** 多选绝对提醒时刻（reminderTimes 来源）触发的具体时刻 */
  reminderTime: number | null;
}

export class TaskService {
  private taskRepository: TaskRepository;

  constructor(db: Database) {
    this.taskRepository = new TaskRepository(db);
  }

  async getAllTasks(): Promise<Task[]> {
    return this.taskRepository.getAll();
  }

  async getTaskById(id: string): Promise<Task | null> {
    return this.taskRepository.getById(id);
  }

  async getTasksByFolderId(folderId: string): Promise<Task[]> {
    return this.taskRepository.getByFolderId(folderId);
  }

  async getCompletedTasks(folderId?: string): Promise<Task[]> {
    return this.taskRepository.getCompleted(folderId);
  }

  async createTask(
    title: string,
    folderId: string | null,
    options?: {
      remark?: string;
      parentId?: string | null;
      deadline?: number | null;
      priority?: Priority;
      reminderOffsets?: string[];
      reminderAt?: number | null;
      reminderTimes?: number[];
      repeatRule?: TaskRepeatRule | null;
      repeatIntervalDays?: number | null;
    }
  ): Promise<Task> {
    const id = generateId();
    const deadline = options?.deadline ?? null;
    // 多选绝对提醒时刻（无需截止时间即可设置）：一旦设置则互斥清空单值 reminderAt 与提前偏移
    const reminderTimes = sanitizeTimes(options?.reminderTimes);
    const useMulti = reminderTimes.length > 0;
    const reminderOffsets = useMulti ? [] : sanitizeOffsets(options?.reminderOffsets);
    // 显式提醒时刻（无需截止时间即可设置）优先于相对偏移派生；两者互斥，由调用方保证
    const explicitReminderAt = useMulti ? null : (options?.reminderAt ?? null);

    return this.taskRepository.create({
      id,
      title,
      remark: options?.remark || '',
      folderId,
      parentId: options?.parentId || null,
      startDate: null,
      deadline,
      priority: options?.priority || 'normal',
      reminderAt: explicitReminderAt ?? deriveReminderAt(deadline, reminderOffsets),
      reminderOffsets,
      reminderFiredOffsets: [],
      reminderTimes,
      reminderFiredTimes: [],
      repeatRule: options?.repeatRule ?? null,
      repeatIntervalDays: options?.repeatIntervalDays ?? null,
      // 带重复规则的任务：首实例以自身 id 作为系列标识（模板也计入"累计完成x次"）
      repeatSeriesId: options?.repeatRule ? id : null,
      repeatNextId: null,
    });
  }

  async updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'deadline' | 'priority' | 'reminderAt' | 'reminderFired' | 'reminderOffsets' | 'reminderFiredOffsets' | 'reminderTimes' | 'reminderFiredTimes' | 'repeatRule' | 'repeatIntervalDays'>>): Promise<Task | null> {
    const patch = { ...updates } as Partial<Task>;
    // 设置重复规则时，若无系列标识则创建（列表/日/月视图立即显示重复标签并开始计数）
    if ('repeatRule' in patch) {
      const current = await this.taskRepository.getById(id);
      if (current && patch.repeatRule && !current.repeatSeriesId) {
        patch.repeatSeriesId = id;
      }
    }
    // 截止时间 / 偏移 / 单值 / 多选提醒变化时，重置已触发标记并处理各提醒来源的互斥（提醒配置变更，旧通知作废、重新武装）
    const deadlineChanged = 'deadline' in patch;
    const offsetsChanged = 'reminderOffsets' in patch;
    const reminderAtChanged = 'reminderAt' in patch;
    const timesChanged = 'reminderTimes' in patch;
    if (deadlineChanged || offsetsChanged || reminderAtChanged || timesChanged) {
      const current = await this.taskRepository.getById(id);
      if (current) {
        const deadline = patch.deadline !== undefined ? patch.deadline : current.deadline;
        const offsets = offsetsChanged ? sanitizeOffsets(patch.reminderOffsets) : (current.reminderOffsets ?? []);
        if (timesChanged) {
          // 多选绝对提醒时刻显式设置：互斥清空单值 reminderAt 与提前偏移
          const times = sanitizeTimes(patch.reminderTimes);
          patch.reminderTimes = times;
          patch.reminderAt = times.length ? null : (patch.reminderAt ?? null);
          if (times.length) patch.reminderOffsets = [];
        } else if (reminderAtChanged) {
          // 单值绝对提醒时刻显式设置：互斥清空多选与提前偏移
          patch.reminderAt = patch.reminderAt ?? null;
          if (patch.reminderAt != null) { patch.reminderOffsets = []; patch.reminderTimes = []; }
        } else {
          // 未显式设置任何绝对提醒：任务若未用多选提醒，则按「截止 + 提前偏移」派生单值兜底
          const currentTimes = current.reminderTimes ?? [];
          if (currentTimes.length === 0) {
            patch.reminderAt = deriveReminderAt(deadline, offsets);
          }
        }
        patch.reminderFired = false;
        patch.reminderFiredOffsets = [];
        patch.reminderFiredTimes = [];
        if (offsetsChanged) {
          const usesMulti = Array.isArray(patch.reminderTimes) && patch.reminderTimes.length > 0;
          patch.reminderOffsets = (patch.reminderAt != null || usesMulti) ? [] : sanitizeOffsets(patch.reminderOffsets);
        }
      }
    }
    return this.taskRepository.update(id, patch);
  }

  /** 手动排序：按给定顺序持久化任务顺序 */
  async reorderTasks(orderedIds: string[]): Promise<boolean> {
    return this.taskRepository.reorderTasks(orderedIds);
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.taskRepository.softDelete(id);
  }

  /** 读取已删除任务（30 天保留期内） */
  async getAllDeleted(): Promise<Task[]> {
    return this.taskRepository.getAllDeleted();
  }

  /** 物理清除超过保留期的已删除任务（deleted=1 且 updatedAt <= threshold），返回清除条数 */
  async purgeDeleted(thresholdMs: number): Promise<number> {
    return this.taskRepository.purgeDeleted(thresholdMs);
  }

  async restoreTask(id: string): Promise<boolean> {
    // 撤销完成 / 恢复任务（repo.restore 置 completed=0）。
    // 若被恢复的是重复任务，需清理其自动生成的下一实例（整系列未完成实例），
    // 避免列表/已完成区出现多条同样的重复任务（数据爆炸）。
    const task = await this.taskRepository.getById(id); // getById 仅返回 deleted=0 的任务
    const ok = await this.taskRepository.restore(id);
    if (ok && task && !task.deleted) {
      await this.cleanupUndoSeries(task);
    }
    return ok;
  }

  async toggleTaskCompleted(id: string): Promise<Task | null> {
    const task = await this.taskRepository.getById(id);
    if (!task) return null;

    const newCompleted = !task.completed;
    const updated = await this.taskRepository.markCompleted(id, newCompleted);

    if (updated && updated.parentId) {
      await this.updateParentCompletion(updated.parentId);
    }

    // 重复任务：完成上一实例后自动生成下一实例并顺延截止（V2.1.2）
    if (updated && newCompleted && task.repeatRule && task.deadline) {
      await this.spawnNextInstance(task);
    }

    // 撤销完成重复任务：清理整系列未完成实例（避免列表出现两条同样的重复任务 / 数据爆炸）
    if (updated && !newCompleted && task.repeatRule && task.repeatSeriesId) {
      await this.cleanupUndoSeries(task);
    }

    return updated;
  }

  /** 计算下一次截止时间（重复规则） */
  private static nextDeadline(deadline: number, rule: TaskRepeatRule, intervalDays: number | null): number {
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

  /** 生成重复任务的下一实例（复制标题/备注/优先级/容器，截止顺延，不重复的提醒清空，继承重复系列），并在父任务记录 repeatNextId */
  private async spawnNextInstance(task: Task): Promise<Task | null> {
    const next = TaskService.nextDeadline(task.deadline!, task.repeatRule!, task.repeatIntervalDays);
    const nextId = generateId();
    // 重复任务的下一实例自动继承提醒设置：
    // - 相对截止的提前偏移（reminderOffsets）原样继承，随新截止日期自动顺延（如 9/9 提前1天 → 9/8；下月 10/9 提前1天 → 10/8）
    // - 多选绝对提醒时刻（reminderTimes）原样继承，保持一致提醒习惯
    // - reminderAt 重派生：多选优先置 null，否则由「新截止 + 偏移」派生；已触发标记全部重置（新实例重新武装）
    const offsets = task.reminderOffsets ?? [];
    const times = task.reminderTimes ?? [];
    const created = await this.taskRepository.create({
      id: nextId,
      title: task.title,
      remark: task.remark,
      folderId: task.folderId,
      parentId: task.parentId,
      startDate: null,
      deadline: next,
      priority: task.priority,
      reminderAt: times.length ? null : deriveReminderAt(next, offsets),
      reminderOffsets: offsets,
      reminderFiredOffsets: [],
      reminderTimes: times,
      reminderFiredTimes: [],
      repeatRule: task.repeatRule,
      repeatIntervalDays: task.repeatIntervalDays,
      repeatSeriesId: task.repeatSeriesId ?? task.id,
      repeatNextId: null,
    });
    // 记录父任务自动生成的下一实例，供撤销完成时删除（避免重复任务/数据爆炸）
    await this.taskRepository.update(task.id, { repeatNextId: nextId });
    return created;
  }

  /**
   * 撤销重复任务完成后的系列清理：清空父任务 repeatNextId 关联，并按稳定的
   * repeatSeriesId 软删该系列下所有未完成实例（不含被恢复任务本身）。
   * 以 repeatSeriesId（创建时即固定）为准而非易丢失的 repeatNextId 单链，
   * 从而覆盖：历史残留、撤销后再完成二次生成的实例、同步可能复活的未完成副本。
   *
   * 防御性回退：若 repeatSeriesId 因旧版同步遗漏等原因为空，则退化为按 repeatNextId
   * 单链清理（至少清掉最近一次自动生成的下一实例），避免完全不清理。
   */
  private async cleanupUndoSeries(task: Task): Promise<void> {
    if (!task.repeatRule) return;
    // 先清空父任务的 repeatNextId 关联（无论走哪条清理路径都需要）
    await this.taskRepository.update(task.id, { repeatNextId: null });

    if (task.repeatSeriesId) {
      // 主路径：按稳定的系列 ID 清理整系列未完成实例
      await this.taskRepository.deleteIncompleteSeries(task.repeatSeriesId, task.id);
    } else if (task.repeatNextId) {
      // 回退路径：repeatSeriesId 缺失（如旧版同步清空），按 repeatNextId 单链清理最近一条
      const next = await this.taskRepository.getById(task.repeatNextId);
      if (next && !next.completed && !next.deleted) {
        await this.taskRepository.softDelete(next.id);
      }
    }
  }

  /** 统计同一重复系列已完成的实例数（用于"已重复 N 次"） */
  async countRepeatDone(seriesId: string): Promise<number> {
    return this.taskRepository.getCompletedCountBySeries(seriesId);
  }

  /**
   * 结束重复：清除该任务的重复规则（不再生成下一实例），
   * 并将其标记为已完成（移入"已完成"区）。
   * 因 repeatRule 已先清空，不会触发 spawnNextInstance。
   */
  async stopRepeat(id: string): Promise<Task | null> {
    // 1. 清除重复规则与单链关联
    await this.taskRepository.update(id, {
      repeatRule: null,
      repeatIntervalDays: null,
      repeatNextId: null,
    });
    // 2. 若尚未完成，标记为已完成（直接走 markCompleted，不经过 toggleTaskCompleted 的 spawn 逻辑）
    const task = await this.taskRepository.getById(id);
    if (task && !task.completed) {
      return this.taskRepository.markCompleted(id, true);
    }
    return task;
  }

  /** 读取提醒时间已到且未触发、未完成、未删除的提醒项。偏移逐个触发，多选绝对时刻逐个触发，旧版单次 reminderAt 一次触发 */
  async getDueReminders(now: number): Promise<DueReminder[]> {
    const candidates = await this.taskRepository.getReminderCandidates();
    const due: DueReminder[] = [];
    for (const t of candidates) {
      const hasOffsets = Array.isArray(t.reminderOffsets) && t.reminderOffsets.length > 0;
      const hasTimes = Array.isArray(t.reminderTimes) && t.reminderTimes.length > 0;
      if (hasOffsets && t.deadline != null) {
        const fired = new Set(t.reminderFiredOffsets ?? []);
        for (const item of offsetReminderTimes(t.deadline, t.reminderOffsets)) {
          if (item.time <= now && !fired.has(item.key)) {
            due.push({ task: t, offsetKey: item.key, reminderTime: null });
          }
        }
      } else if (hasTimes) {
        const fired = new Set(t.reminderFiredTimes ?? []);
        for (const tm of t.reminderTimes) {
          if (tm <= now && !fired.has(tm)) {
            due.push({ task: t, offsetKey: null, reminderTime: tm });
          }
        }
      } else if (t.reminderAt != null && t.reminderAt <= now) {
        due.push({ task: t, offsetKey: null, reminderTime: null });
      }
    }
    return due;
  }

  /** 标记提醒已触发。offsetKey 非空标记单偏移；reminderTime 非空标记多选绝对时刻；两者皆空标记旧版单次提醒。全部触发后整体标记 */
  async markReminderFired(id: string, offsetKey: string | null = null, reminderTime: number | null = null): Promise<boolean> {
    if (offsetKey != null) {
      return this._markOffsetFired(id, offsetKey);
    }
    if (reminderTime != null) {
      return this._markTimeFired(id, reminderTime);
    }
    return this.taskRepository.markReminderFired(id);
  }

  /** 标记单个提前偏移已触发；所有偏移均触发后整体标记 */
  private async _markOffsetFired(id: string, offsetKey: string): Promise<boolean> {
    const task = await this.taskRepository.getById(id);
    if (!task) return false;
    const offsets = task.reminderOffsets ?? [];
    const fired = new Set(task.reminderFiredOffsets ?? []);
    fired.add(offsetKey);
    const allFired = offsets.filter(isReminderOffsetKey).every((k) => fired.has(k));
    const patch: Partial<Task> = { reminderFiredOffsets: [...fired] };
    if (allFired) patch.reminderFired = true;
    await this.taskRepository.update(id, patch);
    return true;
  }

  /** 标记单个多选绝对提醒时刻已触发；所有时刻均触发后整体标记 */
  private async _markTimeFired(id: string, reminderTime: number): Promise<boolean> {
    const task = await this.taskRepository.getById(id);
    if (!task) return false;
    const times = [...(task.reminderTimes ?? [])];
    const fired = new Set(task.reminderFiredTimes ?? []);
    fired.add(reminderTime);
    const allFired = times.every((tm) => fired.has(tm));
    const patch: Partial<Task> = { reminderFiredTimes: [...fired] };
    if (allFired) patch.reminderFired = true;
    await this.taskRepository.update(id, patch);
    return true;
  }

  async getParentTaskCompletion(parentId: string): Promise<{ completed: number; total: number }> {
    const total = await this.taskRepository.getSubtaskCount(parentId);
    const completed = await this.taskRepository.getCompletedSubtaskCount(parentId);
    return { completed, total };
  }

  private async updateParentCompletion(parentId: string): Promise<void> {
    const { completed, total } = await this.getParentTaskCompletion(parentId);

    if (total > 0) {
      const allCompleted = completed === total;
      const parentTask = await this.taskRepository.markCompleted(parentId, allCompleted);

      if (parentTask && parentTask.parentId) {
        await this.updateParentCompletion(parentTask.parentId);
      }
    }
  }

  buildTaskTree(tasks: Task[]): TaskWithSubtasks[] {
    return buildTaskTree(tasks);
  }
}
