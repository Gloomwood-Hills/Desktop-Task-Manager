import Database from 'better-sqlite3';
import { WindowState } from '../types';

export class WindowStateRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get(): WindowState | null {
    const row = this.db.prepare(`
      SELECT id, x, y, width, height, collapsedFolders, createdAt, updatedAt
      FROM WindowState
      WHERE id = ?
    `).get('default') as WindowState | undefined;
    return row ? this.mapRow(row) : null;
  }

  update(windowState: Partial<WindowState>): WindowState | null {
    const existing = this.get();
    if (!existing) return null;

    const now = Date.now();
    const updatedWindowState: WindowState = {
      ...existing,
      ...windowState,
      updatedAt: now,
    };

    this.db.prepare(`
      UPDATE WindowState
      SET x = ?, y = ?, width = ?, height = ?, collapsedFolders = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      updatedWindowState.x,
      updatedWindowState.y,
      updatedWindowState.width,
      updatedWindowState.height,
      JSON.stringify(updatedWindowState.collapsedFolders),
      updatedWindowState.updatedAt,
      updatedWindowState.id
    );

    return updatedWindowState;
  }

  updatePosition(x: number, y: number): WindowState | null {
    return this.update({ x, y });
  }

  updateSize(width: number, height: number): WindowState | null {
    return this.update({ width, height });
  }

  updateCollapsedFolders(collapsedFolders: string[]): WindowState | null {
    return this.update({ collapsedFolders });
  }

  private mapRow(row: any): WindowState {
    return {
      ...row,
      collapsedFolders: typeof row.collapsedFolders === 'string' ? JSON.parse(row.collapsedFolders) : [],
    };
  }
}