import Database from 'better-sqlite3';
import { Folder } from '../types';

export class FolderRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getAll(): Folder[] {
    const rows = this.db.prepare(`
      SELECT id, name, parentId, sortOrder, createdAt, updatedAt
      FROM Folder
      ORDER BY sortOrder ASC
    `).all() as Folder[];
    return rows;
  }

  getById(id: string): Folder | null {
    const row = this.db.prepare(`
      SELECT id, name, parentId, sortOrder, createdAt, updatedAt
      FROM Folder
      WHERE id = ?
    `).get(id) as Folder | undefined;
    return row || null;
  }

  getByParentId(parentId: string | null): Folder[] {
    const rows = this.db.prepare(`
      SELECT id, name, parentId, sortOrder, createdAt, updatedAt
      FROM Folder
      WHERE parentId ${parentId ? '= ?' : 'IS NULL'}
      ORDER BY sortOrder ASC
    `).all(parentId || undefined) as Folder[];
    return rows;
  }

  create(folder: Omit<Folder, 'createdAt' | 'updatedAt'>): Folder {
    const now = Date.now();
    const newFolder: Folder = {
      ...folder,
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO Folder (id, name, parentId, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newFolder.id, newFolder.name, newFolder.parentId, newFolder.sortOrder, newFolder.createdAt, newFolder.updatedAt);

    return newFolder;
  }

  update(folder: Partial<Folder> & { id: string }): Folder | null {
    const existing = this.getById(folder.id);
    if (!existing) return null;

    const now = Date.now();
    const updatedFolder: Folder = {
      ...existing,
      ...folder,
      updatedAt: now,
    };

    this.db.prepare(`
      UPDATE Folder
      SET name = ?, parentId = ?, sortOrder = ?, updatedAt = ?
      WHERE id = ?
    `).run(updatedFolder.name, updatedFolder.parentId, updatedFolder.sortOrder, updatedFolder.updatedAt, updatedFolder.id);

    return updatedFolder;
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM Folder WHERE id = ?
    `).run(id);
    return result.changes > 0;
  }

  updateSortOrder(folderId: string, newSortOrder: number): boolean {
    const now = Date.now();
    const result = this.db.prepare(`
      UPDATE Folder SET sortOrder = ?, updatedAt = ? WHERE id = ?
    `).run(newSortOrder, now, folderId);
    return result.changes > 0;
  }
}