import Database from 'better-sqlite3';
import { Task } from '../types';

export class TaskRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getAll(): Task[] {
    const rows = this.db.prepare(`
      SELECT id, title, remark, folderId, parentId, startDate, deadline, priority,
             completed, completedAt, deleted, createdAt, updatedAt
      FROM Task
      WHERE deleted = 0
      ORDER BY createdAt DESC
    `).all() as Task[];
    return rows.map(this.mapRow);
  }

  getById(id: string): Task | null {
    const row = this.db.prepare(`
      SELECT id, title, remark, folderId, parentId, startDate, deadline, priority,
             completed, completedAt, deleted, createdAt, updatedAt
      FROM Task
      WHERE id = ? AND deleted = 0
    `).get(id) as Task | undefined;
    return row ? this.mapRow(row) : null;
  }

  getByFolderId(folderId: string): Task[] {
    const rows = this.db.prepare(`
      SELECT id, title, remark, folderId, parentId, startDate, deadline, priority,
             completed, completedAt, deleted, createdAt, updatedAt
      FROM Task
      WHERE folderId = ? AND deleted = 0
      ORDER BY createdAt DESC
    `).all(folderId) as Task[];
    return rows.map(this.mapRow);
  }

  getByParentId(parentId: string): Task[] {
    const rows = this.db.prepare(`
      SELECT id, title, remark, folderId, parentId, startDate, deadline, priority,
             completed, completedAt, deleted, createdAt, updatedAt
      FROM Task
      WHERE parentId = ? AND deleted = 0
      ORDER BY createdAt ASC
    `).all(parentId) as Task[];
    return rows.map(this.mapRow);
  }

  getCompleted(folderId?: string): Task[] {
    const query = folderId
      ? `WHERE completed = 1 AND deleted = 0 AND folderId = ?`
      : `WHERE completed = 1 AND deleted = 0`;

    const rows = this.db.prepare(`
      SELECT id, title, remark, folderId, parentId, startDate, deadline, priority,
             completed, completedAt, deleted, createdAt, updatedAt
      FROM Task
      ${query}
      ORDER BY completedAt DESC
    `).all(folderId || undefined) as Task[];
    return rows.map(this.mapRow);
  }

  create(task: Omit<Task, 'completed' | 'completedAt' | 'deleted' | 'createdAt' | 'updatedAt'>): Task {
    const now = Date.now();
    const newTask: Task = {
      ...task,
      completed: false,
      completedAt: null,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO Task (id, title, remark, folderId, parentId, startDate, deadline, priority,
                        completed, completedAt, deleted, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newTask.id, newTask.title, newTask.remark, newTask.folderId, newTask.parentId,
      newTask.startDate, newTask.deadline, newTask.priority,
      newTask.completed ? 1 : 0, newTask.completedAt, newTask.deleted ? 1 : 0,
      newTask.createdAt, newTask.updatedAt
    );

    return newTask;
  }

  update(task: Partial<Task> & { id: string }): Task | null {
    const existing = this.getById(task.id);
    if (!existing) return null;

    const now = Date.now();
    const updatedTask: Task = {
      ...existing,
      ...task,
      updatedAt: now,
    };

    this.db.prepare(`
      UPDATE Task
      SET title = ?, remark = ?, folderId = ?, parentId = ?, startDate = ?, deadline = ?,
          priority = ?, completed = ?, completedAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      updatedTask.title, updatedTask.remark, updatedTask.folderId, updatedTask.parentId,
      updatedTask.startDate, updatedTask.deadline, updatedTask.priority,
      updatedTask.completed ? 1 : 0, updatedTask.completedAt, updatedTask.updatedAt,
      updatedTask.id
    );

    return updatedTask;
  }

  softDelete(id: string): boolean {
    const now = Date.now();
    const result = this.db.prepare(`
      UPDATE Task SET deleted = 1, updatedAt = ? WHERE id = ?
    `).run(now, id);
    return result.changes > 0;
  }

  restore(id: string): boolean {
    const now = Date.now();
    const result = this.db.prepare(`
      UPDATE Task SET deleted = 0, updatedAt = ? WHERE id = ?
    `).run(now, id);
    return result.changes > 0;
  }

  markCompleted(id: string, completed: boolean): Task | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = Date.now();
    const updatedTask: Task = {
      ...existing,
      completed,
      completedAt: completed ? now : null,
      updatedAt: now,
    };

    this.db.prepare(`
      UPDATE Task SET completed = ?, completedAt = ?, updatedAt = ? WHERE id = ?
    `).run(updatedTask.completed ? 1 : 0, updatedTask.completedAt, updatedTask.updatedAt, updatedTask.id);

    return updatedTask;
  }

  getSubtaskCount(parentId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM Task WHERE parentId = ? AND deleted = 0
    `).get(parentId) as { count: number };
    return result.count;
  }

  getCompletedSubtaskCount(parentId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM Task WHERE parentId = ? AND completed = 1 AND deleted = 0
    `).get(parentId) as { count: number };
    return result.count;
  }

  private mapRow(row: any): Task {
    return {
      ...row,
      completed: row.completed === 1,
      deleted: row.deleted === 1,
    };
  }
}