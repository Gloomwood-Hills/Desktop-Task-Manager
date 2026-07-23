import Database from '@tauri-apps/plugin-sql';
import { Folder } from '../types';

export class FolderRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getAll(): Promise<Folder[]> {
    const rows = await this.db.select<Folder[]>(`
      SELECT id, name, parentId, sortOrder, createdAt, updatedAt
      FROM Folder
      ORDER BY sortOrder ASC
    `);
    return rows;
  }

  async getById(id: string): Promise<Folder | null> {
    const rows = await this.db.select<Folder[]>(
      `SELECT id, name, parentId, sortOrder, createdAt, updatedAt FROM Folder WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async getByParentId(parentId: string | null): Promise<Folder[]> {
    if (parentId) {
      return await this.db.select<Folder[]>(
        `SELECT id, name, parentId, sortOrder, createdAt, updatedAt
         FROM Folder WHERE parentId = ? ORDER BY sortOrder ASC`,
        [parentId]
      );
    } else {
      return await this.db.select<Folder[]>(
        `SELECT id, name, parentId, sortOrder, createdAt, updatedAt
         FROM Folder WHERE parentId IS NULL ORDER BY sortOrder ASC`
      );
    }
  }

  async create(folder: Omit<Folder, 'createdAt' | 'updatedAt'>): Promise<Folder> {
    const now = Date.now();
    const newFolder: Folder = {
      ...folder,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO Folder (id, name, parentId, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newFolder.id, newFolder.name, newFolder.parentId, newFolder.sortOrder, newFolder.createdAt, newFolder.updatedAt]
    );

    return newFolder;
  }

  async update(folder: Partial<Folder> & { id: string }): Promise<Folder | null> {
    const existing = await this.getById(folder.id);
    if (!existing) return null;

    const now = Date.now();
    const updatedFolder: Folder = {
      ...existing,
      ...folder,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE Folder SET name = ?, parentId = ?, sortOrder = ?, updatedAt = ? WHERE id = ?`,
      [updatedFolder.name, updatedFolder.parentId, updatedFolder.sortOrder, updatedFolder.updatedAt, updatedFolder.id]
    );

    return updatedFolder;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute(`DELETE FROM Folder WHERE id = ?`, [id]);
    return result.rowsAffected > 0;
  }

  async updateSortOrder(folderId: string, newSortOrder: number): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE Folder SET sortOrder = ?, updatedAt = ? WHERE id = ?`,
      [newSortOrder, now, folderId]
    );
    return result.rowsAffected > 0;
  }
}
