import Database from '@tauri-apps/plugin-sql';
import { Settings, Theme, SortType } from '../types';
import { mapBooleanFields } from '../utils';

export class SettingsRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async get(): Promise<Settings | null> {
    const rows = await this.db.select<Settings[]>(
      `SELECT id, theme, glassEffect, transparency, sortType, reminderEnabled, reminderOffset, createdAt, updatedAt
       FROM Settings WHERE id = ?`,
      ['default']
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async update(settings: Partial<Settings>): Promise<Settings | null> {
    const existing = await this.get();
    if (!existing) return null;

    const now = Date.now();
    const updatedSettings: Settings = {
      ...existing,
      ...settings,
      updatedAt: now,
    };

    await this.db.execute(
      `UPDATE Settings
       SET theme = ?, glassEffect = ?, transparency = ?, sortType = ?, reminderEnabled = ?, reminderOffset = ?, updatedAt = ?
       WHERE id = ?`,
      [
        updatedSettings.theme,
        updatedSettings.glassEffect ? 1 : 0,
        updatedSettings.transparency,
        updatedSettings.sortType,
        updatedSettings.reminderEnabled ? 1 : 0,
        updatedSettings.reminderOffset,
        updatedSettings.updatedAt,
        updatedSettings.id,
      ]
    );

    return updatedSettings;
  }

  async updateTheme(theme: Theme): Promise<Settings | null> {
    return this.update({ theme });
  }

  async updateGlassEffect(glassEffect: boolean): Promise<Settings | null> {
    return this.update({ glassEffect });
  }

  async updateTransparency(transparency: number): Promise<Settings | null> {
    return this.update({ transparency });
  }

  async updateSortType(sortType: SortType): Promise<Settings | null> {
    return this.update({ sortType });
  }

  async updateReminderEnabled(reminderEnabled: boolean): Promise<Settings | null> {
    return this.update({ reminderEnabled });
  }

  async updateReminderOffset(reminderOffset: number): Promise<Settings | null> {
    return this.update({ reminderOffset });
  }

  private mapRow(row: unknown): Settings {
    const r = row as Record<string, unknown>;
    return mapBooleanFields(r, ['glassEffect', 'reminderEnabled'] as (keyof Settings)[]) as unknown as Settings;
  }
}
