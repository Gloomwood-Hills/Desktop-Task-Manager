import Database from '@tauri-apps/plugin-sql';
import { Folder } from '../types';
import { mapBooleanFields } from '../utils';

const FOLDER_COLUMNS = 'id, name, parentId, sortOrder, createdAt, updatedAt, deleted';

export class FolderRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getAll(): Promise<Folder[]> {
    const rows = await this.db.select<Folder[]>(
      `SELECT ${FOLDER_COLUMNS} FROM Folder WHERE deleted = 0 ORDER BY sortOrder ASC`
    );
    return rows.map(this.mapRow);
  }

  async getById(id: string): Promise<Folder | null> {
    const rows = await this.db.select<Folder[]>(
      `SELECT ${FOLDER_COLUMNS} FROM Folder WHERE id = ? AND deleted = 0`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getByParentId(parentId: string | null): Promise<Folder[]> {
    if (parentId) {
      const rows = await this.db.select<Folder[]>(
        `SELECT ${FOLDER_COLUMNS} FROM Folder WHERE parentId = ? AND deleted = 0 ORDER BY sortOrder ASC`,
        [parentId]
      );
      return rows.map(this.mapRow);
    } else {
      const rows = await this.db.select<Folder[]>(
        `SELECT ${FOLDER_COLUMNS} FROM Folder WHERE parentId IS NULL AND deleted = 0 ORDER BY sortOrder ASC`
      );
      return rows.map(this.mapRow);
    }
  }

  /** 全量读取（含软删墓碑），供快照导出与合并使用 */
  async getAllIncludingDeleted(): Promise<Folder[]> {
    const rows = await this.db.select<Folder[]>(
      `SELECT ${FOLDER_COLUMNS} FROM Folder ORDER BY sortOrder ASC`
    );
    return rows.map(this.mapRow);
  }

  async create(folder: Omit<Folder, 'createdAt' | 'updatedAt'>): Promise<Folder> {
    const now = Date.now();
    const newFolder: Folder = {
      ...folder,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO Folder (id, name, parentId, sortOrder, createdAt, updatedAt, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newFolder.id, newFolder.name, newFolder.parentId, newFolder.sortOrder, newFolder.createdAt, newFolder.updatedAt, newFolder.deleted ? 1 : 0]
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

  /**
   * 软删级联删除：将目标文件夹及其整个子树（含自身）标记 deleted=1，
   * 并同步软删子树下直属任务（原物理删除依赖 FK CASCADE，软删后必须手动级联，
   * 否则任务残留且 UI 无法隐藏）。保留墓碑供跨端同步传播。
   */
  async delete(id: string): Promise<boolean> {
    const folders = await this.getAllIncludingDeleted();
    const folderById = new Map(folders.map((f) => [f.id, f]));

    // 以 id 为根，用父链 parentId 递归收集整个子树（含自身）
    const idsToDelete: string[] = [];
    const visited = new Set<string>();
    const collect = (folderId: string) => {
      if (!folderById.has(folderId) || visited.has(folderId)) return;
      visited.add(folderId);
      idsToDelete.push(folderId);
      folders.forEach((f) => {
        if (f.parentId === folderId) collect(f.id);
      });
    };
    collect(id);

    if (idsToDelete.length === 0) return false;

    const now = Date.now();
    const placeholders = idsToDelete.map(() => '?').join(', ');

    // 软删子树全部文件夹（now 在前，随后为 id 列表）
    const folderResult = await this.db.execute(
      `UPDATE Folder SET deleted = 1, updatedAt = ? WHERE id IN (${placeholders})`,
      [now, ...idsToDelete]
    );

    // 软删子树下直属任务
    await this.db.execute(
      `UPDATE Task SET deleted = 1, updatedAt = ? WHERE folderId IN (${placeholders}) AND deleted = 0`,
      [now, ...idsToDelete]
    );

    return folderResult.rowsAffected > 0;
  }

  async updateSortOrder(folderId: string, newSortOrder: number): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE Folder SET sortOrder = ?, updatedAt = ? WHERE id = ?`,
      [newSortOrder, now, folderId]
    );
    return result.rowsAffected > 0;
  }

  /** 手动排序：按给定顺序批量更新 sortOrder（同级文件夹容器内） */
  async reorderFolders(orderedIds: string[]): Promise<boolean> {
    const now = Date.now();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.execute(
        `UPDATE Folder SET sortOrder = ?, updatedAt = ? WHERE id = ?`,
        [i, now, orderedIds[i]]
      );
    }
    return true;
  }

  private mapRow(row: unknown): Folder {
    const r = row as Record<string, unknown>;
    return mapBooleanFields(r, ['deleted'] as (keyof Folder)[]) as unknown as Folder;
  }
}
