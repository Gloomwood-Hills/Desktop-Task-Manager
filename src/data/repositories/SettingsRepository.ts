import Database from 'better-sqlite3';
import { Settings, Theme, SortType } from '../types';

export class SettingsRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get(): Settings | null {
    const row = this.db.prepare(`
      SELECT id, theme, glassEffect, transparency, sortType, reminderEnabled, reminderOffset, createdAt, updatedAt
      FROM Settings
      WHERE id = ?
    `).get('default') as Settings | undefined;
    return row ? this.mapRow(row) : null;
  }

  update(settings: Partial<Settings>): Settings | null {
    const existing = this.get();
    if (!existing) return null;

    const now = Date.now();
    const updatedSettings: Settings = {
      ...existing,
      ...settings,
      updatedAt: now,
    };

    this.db.prepare(`
      UPDATE Settings
      SET theme = ?, glassEffect = ?, transparency = ?, sortType = ?, reminderEnabled = ?, reminderOffset = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      updatedSettings.theme,
      updatedSettings.glassEffect ? 1 : 0,
      updatedSettings.transparency,
      updatedSettings.sortType,
      updatedSettings.reminderEnabled ? 1 : 0,
      updatedSettings.reminderOffset,
      updatedSettings.updatedAt,
      updatedSettings.id
    );

    return updatedSettings;
  }

  updateTheme(theme: Theme): Settings | null {
    return this.update({ theme });
  }

  updateGlassEffect(glassEffect: boolean): Settings | null {
    return this.update({ glassEffect });
  }

  updateTransparency(transparency: number): Settings | null {
    return this.update({ transparency });
  }

  updateSortType(sortType: SortType): Settings | null {
    return this.update({ sortType });
  }

  updateReminderEnabled(reminderEnabled: boolean): Settings | null {
    return this.update({ reminderEnabled });
  }

  updateReminderOffset(reminderOffset: number): Settings | null {
    return this.update({ reminderOffset });
  }

  private mapRow(row: any): Settings {
    return {
      ...row,
      glassEffect: row.glassEffect === 1,
      reminderEnabled: row.reminderEnabled === 1,
    };
  }
}