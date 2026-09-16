import Database from '@tauri-apps/plugin-sql';
import { Task } from '../types';
import { mapBooleanFields } from '../utils';

type TaskUpdateFields = Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'parentId' | 'startDate' | 'deadline' | 'priority' | 'reminderAt' | 'reminderFired' | 'reminderOffsets' | 'reminderFiredOffsets' | 'reminderTimes' | 'reminderFiredTimes' | 'repeatRule' | 'repeatIntervalDays' | 'repeatSeriesId' | 'repeatNextId'>>;

const TASK_COLUMNS = `
  id, title, remark, folderId, parentId, startDate, deadline, priority, sortOrder,
  completed, completedAt, deleted, reminderAt, reminderFired, reminderOffsets, reminderFiredOffsets,
  reminderTimes, reminderFiredTimes, repeatRule, repeatIntervalDays, repeatSeriesId, repeatNextId, createdAt, updatedAt
`;

export class TaskRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getAll(): Promise<Task[]> {
    const rows = await this.db.select<Task[]>(`
      SELECT ${TASK_COLUMNS}
      FROM Task
      WHERE deleted = 0
      ORDER BY sortOrder ASC, createdAt DESC
    `);
    return rows.map(this.mapRow);
  }

  /** 全量读取（含软删墓碑），供快照导出与合并使用 */
  async getAllIncludingDeleted(): Promise<Task[]> {
    const rows = await this.db.select<Task[]>(`
      SELECT ${TASK_COLUMNS}
      FROM Task
      ORDER BY sortOrder ASC, createdAt DESC
    `);
    return rows.map(this.mapRow);
  }

  /** 读取软删任务（已删除，用于「已删除」查看；保留 30 天以内的） */
  async getAllDeleted(): Promise<Task[]> {
    const rows = await this.db.select<Task[]>(
      `SELECT ${TASK_COLUMNS} FROM Task WHERE deleted = 1 ORDER BY updatedAt DESC`,
      []
    );
    return rows.map(this.mapRow);
  }

  /** 物理清除超过保留期的软删任务（deleted=1 且 updatedAt <= threshold），返回清除条数 */
  async purgeDeleted(thresholdMs: number): Promise<number> {
    const result = await this.db.execute(
      'DELETE FROM Task WHERE deleted = 1 AND updatedAt <= ?',
      [thresholdMs]
    );
    return result.rowsAffected ?? 0;
  }

  async getById(id: string): Promise<Task | null> {
    const rows = await this.db.select<Task[]>(
      `SELECT ${TASK_COLUMNS} FROM Task WHERE id = ? AND deleted = 0`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getByFolderId(folderId: string): Promise<Task[]> {
    const rows = await this.db.select<Task[]>(
      `SELECT ${TASK_COLUMNS} FROM Task WHERE folderId = ? AND deleted = 0 ORDER BY createdAt DESC`,
      [folderId]
    );
    return rows.map(this.mapRow);
  }

  async getByParentId(parentId: string): Promise<Task[]> {
    const rows = await this.db.select<Task[]>(
      `SELECT ${TASK_COLUMNS} FROM Task WHERE parentId = ? AND deleted = 0 ORDER BY createdAt ASC`,
      [parentId]
    );
    return rows.map(this.mapRow);
  }

  async getCompleted(folderId?: string): Promise<Task[]> {
    if (folderId) {
      const rows = await this.db.select<Task[]>(
        `SELECT ${TASK_COLUMNS} FROM Task
         WHERE completed = 1 AND deleted = 0 AND parentId IS NULL AND folderId = ?
         ORDER BY completedAt DESC`,
        [folderId]
      );
      return rows.map(this.mapRow);
    } else {
      const rows = await this.db.select<Task[]>(
        `SELECT ${TASK_COLUMNS} FROM Task
         WHERE completed = 1 AND deleted = 0 AND parentId IS NULL
         ORDER BY completedAt DESC`
      );
      return rows.map(this.mapRow);
    }
  }

  async create(task: Omit<Task, 'sortOrder' | 'completed' | 'completedAt' | 'deleted' | 'reminderFired' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const now = Date.now();
    // 创建时追加到容器末尾（sortOrder = 当前最大 + 1）
    const sortRows = await this.db.select<{ m: number }[]>(
      'SELECT COALESCE(MAX(sortOrder), 0) + 1 as m FROM Task'
    );
    const sortOrder = sortRows[0]?.m ?? 0;
    const newTask: Task = {
      ...task,
      sortOrder,
      completed: false,
      completedAt: null,
      deleted: false,
      reminderFired: task.reminderFired ?? false,
      reminderOffsets: task.reminderOffsets ?? [],
      reminderFiredOffsets: task.reminderFiredOffsets ?? [],
      reminderTimes: task.reminderTimes ?? [],
      reminderFiredTimes: task.reminderFiredTimes ?? [],
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO Task (id, title, remark, folderId, parentId, startDate, deadline, priority,
                         sortOrder, completed, completedAt, deleted, reminderAt, reminderFired, reminderOffsets, reminderFiredOffsets,
                         reminderTimes, reminderFiredTimes, repeatRule, repeatIntervalDays, repeatSeriesId, repeatNextId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTask.id, newTask.title, newTask.remark, newTask.folderId, newTask.parentId,
        newTask.startDate, newTask.deadline, newTask.priority, newTask.sortOrder,
        newTask.completed ? 1 : 0, newTask.completedAt, newTask.deleted ? 1 : 0,
        newTask.reminderAt, newTask.reminderFired ? 1 : 0,
        JSON.stringify(newTask.reminderOffsets ?? []), JSON.stringify(newTask.reminderFiredOffsets ?? []),
        JSON.stringify(newTask.reminderTimes ?? []), JSON.stringify(newTask.reminderFiredTimes ?? []),
        newTask.repeatRule, newTask.repeatIntervalDays, newTask.repeatSeriesId, newTask.repeatNextId,
        newTask.createdAt, newTask.updatedAt,
      ]
    );

    return newTask;
  }

  /** 手动排序：按给定顺序批量更新 sortOrder */
  async reorderTasks(orderedIds: string[]): Promise<boolean> {
    const now = Date.now();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.execute(
        `UPDATE Task SET sortOrder = ?, updatedAt = ? WHERE id = ? AND deleted = 0`,
        [i, now, orderedIds[i]]
      );
    }
    return true;
  }

  async update(id: string, updates: TaskUpdateFields): Promise<Task | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const now = Date.now();
    const updatedTask: Task = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE Task
       SET title = ?, remark = ?, folderId = ?, parentId = ?, startDate = ?, deadline = ?,
           priority = ?, repeatRule = ?, repeatIntervalDays = ?, repeatSeriesId = ?, reminderAt = ?, reminderFired = ?,
           reminderOffsets = ?, reminderFiredOffsets = ?, reminderTimes = ?, reminderFiredTimes = ?, repeatNextId = ?, updatedAt = ?
       WHERE id = ?`,
      [
        updatedTask.title, updatedTask.remark, updatedTask.folderId, updatedTask.parentId,
        updatedTask.startDate, updatedTask.deadline, updatedTask.priority,
        updatedTask.repeatRule, updatedTask.repeatIntervalDays, updatedTask.repeatSeriesId, updatedTask.reminderAt,
        updatedTask.reminderFired ? 1 : 0,
        JSON.stringify(updatedTask.reminderOffsets ?? []), JSON.stringify(updatedTask.reminderFiredOffsets ?? []),
        JSON.stringify(updatedTask.reminderTimes ?? []), JSON.stringify(updatedTask.reminderFiredTimes ?? []),
        updatedTask.repeatNextId,
        updatedTask.updatedAt, updatedTask.id,
      ]
    );

    return updatedTask;
  }

  async softDelete(id: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE Task SET deleted = 1, updatedAt = ? WHERE id = ?`,
      [now, id]
    );
    return result.rowsAffected > 0;
  }

  /** 软删一个任务及其全部后代（子任务、孙任务……）。先按 parentId 树收集所有后代 id，再统一软删。 */
  async softDeleteWithDescendants(id: string): Promise<boolean> {
    const all = await this.getAll(); // deleted=0 的全部任务
    const ids = new Set<string>();
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      if (ids.has(cur)) continue;
      ids.add(cur);
      for (const t of all) if (t.parentId === cur) queue.push(t.id);
    }
    const now = Date.now();
    for (const did of ids) {
      await this.db.execute(
        `UPDATE Task SET deleted = 1, updatedAt = ? WHERE id = ?`,
        [now, did]
      );
    }
    return ids.size > 0;
  }

  /**
   * 撤销完成工具：软删同一重复系列下所有未完成、未删除的实例（除 exceptId 本身）。
   * 以稳定的 repeatSeriesId 为准，不依赖易丢失/陈旧的 repeatNextId 单链，
   * 能一并清掉历史残留、撤销后再完成二次生成的实例、以及同步可能复活的未完成副本。
   * 返回删除条数。
   */
  async deleteIncompleteSeries(seriesId: string, exceptId: string): Promise<number> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE Task SET deleted = 1, updatedAt = ?
       WHERE repeatSeriesId = ? AND completed = 0 AND deleted = 0 AND id != ?`,
      [now, seriesId, exceptId]
    );
    return result.rowsAffected ?? 0;
  }

  /**
   * 读取同一重复系列下所有未删除任务的 id（含已完成的历史实例）。
   * 供「删除重复任务 = 整系列删除」使用：先取到 id 再逐个按子树软删，子任务不会遗漏。
   */
  async getIdsBySeries(seriesId: string): Promise<string[]> {
    const rows = await this.db.select<{ id: string }[]>(
      `SELECT id FROM Task WHERE repeatSeriesId = ? AND deleted = 0`,
      [seriesId]
    );
    return rows.map((r) => r.id);
  }

  /** 撤销整系列删除：仅把 deleted 置回 0，保留完成态（用于撤销「删除重复系列」） */
  async undeleteSeries(seriesId: string): Promise<number> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE Task SET deleted = 0, updatedAt = ? WHERE repeatSeriesId = ? AND deleted = 1`,
      [now, seriesId]
    );
    return result.rowsAffected ?? 0;
  }

  async restore(id: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE Task SET deleted = 0, completed = 0, completedAt = NULL, updatedAt = ? WHERE id = ?`,
      [now, id]
    );
    return result.rowsAffected > 0;
  }

  async markCompleted(id: string, completed: boolean): Promise<Task | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const now = Date.now();
    const updatedTask: Task = {
      ...existing,
      completed,
      completedAt: completed ? now : null,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE Task SET completed = ?, completedAt = ?, updatedAt = ? WHERE id = ?`,
      [updatedTask.completed ? 1 : 0, updatedTask.completedAt, updatedTask.updatedAt, updatedTask.id]
    );

    return updatedTask;
  }

  /** 统计同一重复系列已完成的实例数（用于"已重复 N 次"） */
  async getCompletedCountBySeries(seriesId: string): Promise<number> {
    const rows = await this.db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM Task WHERE repeatSeriesId = ? AND completed = 1 AND deleted = 0`,
      [seriesId]
    );
    return rows[0]?.count ?? 0;
  }

  /** 读取提醒候选：未触发、未完成、未删除且具备提醒条件（手填/多选 reminderAt·reminderTimes 或 截止+偏移）的任务。
   * 是否真正到点由服务层按各来源计算（支持同一任务多偏移/多时刻逐个触发） */
  async getReminderCandidates(): Promise<Task[]> {
    const rows = await this.db.select<Task[]>(
      `SELECT ${TASK_COLUMNS} FROM Task
       WHERE reminderFired = 0 AND completed = 0 AND deleted = 0
         AND (reminderAt IS NOT NULL
              OR (reminderTimes IS NOT NULL AND reminderTimes != '[]' AND reminderTimes != '')
              OR (deadline IS NOT NULL AND reminderOffsets IS NOT NULL AND reminderOffsets != '[]' AND reminderOffsets != ''))`
    );
    return rows.map(this.mapRow);
  }

  /** 标记单次提醒已触发（旧版手填 reminderAt，或任务所有偏移均已触发后的整体完成标记） */
  async markReminderFired(id: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE Task SET reminderFired = 1, updatedAt = ? WHERE id = ?`,
      [now, id]
    );
    return result.rowsAffected > 0;
  }

  async getSubtaskCount(parentId: string): Promise<number> {
    const rows = await this.db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM Task WHERE parentId = ? AND deleted = 0`,
      [parentId]
    );
    return rows[0].count;
  }
  async getCompletedSubtaskCount(parentId: string): Promise<number> {
    const rows = await this.db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM Task WHERE parentId = ? AND completed = 1 AND deleted = 0`,
      [parentId]
    );
    return rows[0].count;
  }

  private mapRow(row: unknown): Task {
    const r = row as Record<string, unknown>;
    const parsed = mapBooleanFields(r, ['completed', 'deleted', 'reminderFired'] as (keyof Task)[]) as unknown as Task;
    parsed.reminderOffsets = parseJsonArray(parsed.reminderOffsets);
    parsed.reminderFiredOffsets = parseJsonArray(parsed.reminderFiredOffsets);
    parsed.reminderTimes = parseJsonNumberArray(parsed.reminderTimes);
    parsed.reminderFiredTimes = parseJsonNumberArray(parsed.reminderFiredTimes);
    return parsed;
  }
}

/** 解析 SQLite 存储的 JSON 数组字符串；非法或空值回退为空数组 */
function parseJsonArray(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value as string[];
  try {
    const arr = JSON.parse(String(value));
    return Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** 解析 SQLite 存储的 JSON 数字数组（绝对提醒时刻，毫秒）；非法或空值回退为空数组 */
function parseJsonNumberArray(value: unknown): number[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'number' && Number.isFinite(v));
  try {
    const arr = JSON.parse(String(value));
    return Array.isArray(arr) ? arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)) : [];
  } catch {
    return [];
  }
}
