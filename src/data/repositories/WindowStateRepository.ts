import Database from '@tauri-apps/plugin-sql';
import { WindowState } from '../types';
import { parseJSONField } from '../utils';

export class WindowStateRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async get(): Promise<WindowState | null> {
    const rows = await this.db.select<WindowState[]>(
      `SELECT id, x, y, width, height, collapsedFolders, createdAt, updatedAt
       FROM WindowState WHERE id = ?`,
      ['default']
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async update(windowState: Partial<WindowState>): Promise<WindowState | null> {
    const existing = await this.get();
    if (!existing) return null;

    const now = Date.now();
    const updatedWindowState: WindowState = {
      ...existing,
      ...windowState,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE WindowState
       SET x = ?, y = ?, width = ?, height = ?, collapsedFolders = ?, updatedAt = ?
       WHERE id = ?`,
      [
        updatedWindowState.x,
        updatedWindowState.y,
        updatedWindowState.width,
        updatedWindowState.height,
        JSON.stringify(updatedWindowState.collapsedFolders),
        updatedWindowState.updatedAt,
        updatedWindowState.id,
      ]
    );

    return updatedWindowState;
  }

  async updatePosition(x: number, y: number): Promise<WindowState | null> {
    return this.update({ x, y });
  }

  async updateSize(width: number, height: number): Promise<WindowState | null> {
    return this.update({ width, height });
  }

  async updateCollapsedFolders(collapsedFolders: string[]): Promise<WindowState | null> {
    return this.update({ collapsedFolders });
  }

  private mapRow(row: any): WindowState {
    return {
      ...row,
      collapsedFolders: parseJSONField<string[]>(row.collapsedFolders) || [],
    };
  }
}
