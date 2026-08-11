import Database from '@tauri-apps/plugin-sql';
import { Task } from '../types';
import { mapBooleanFields } from '../utils';

type TaskUpdateFields = Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'parentId' | 'startDate' | 'deadline' | 'priority'>>;

const TASK_COLUMNS = `
  id, title, remark, folderId, parentId, startDate, deadline, priority, sortOrder,
  completed, completedAt, deleted, createdAt, updatedAt
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

  async create(task: Omit<Task, 'sortOrder' | 'completed' | 'completedAt' | 'deleted' | 'createdAt' | 'updatedAt'>): Promise<Task> {
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
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO Task (id, title, remark, folderId, parentId, startDate, deadline, priority,
                         sortOrder, completed, completedAt, deleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTask.id, newTask.title, newTask.remark, newTask.folderId, newTask.parentId,
        newTask.startDate, newTask.deadline, newTask.priority, newTask.sortOrder,
        newTask.completed ? 1 : 0, newTask.completedAt, newTask.deleted ? 1 : 0,
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
           priority = ?, updatedAt = ?
       WHERE id = ?`,
      [
        updatedTask.title, updatedTask.remark, updatedTask.folderId, updatedTask.parentId,
        updatedTask.startDate, updatedTask.deadline, updatedTask.priority,
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
    return mapBooleanFields(r, ['completed', 'deleted'] as (keyof Task)[]) as unknown as Task;
  }
}
