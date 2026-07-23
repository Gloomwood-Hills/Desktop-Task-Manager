import Database from '@tauri-apps/plugin-sql';
import { Settings, Theme, SortType } from '../data/types';
import { SettingsRepository } from '../data/repositories';

export class SettingsService {
  private settingsRepository: SettingsRepository;

  constructor(db: Database) {
    this.settingsRepository = new SettingsRepository(db);
  }

  async getSettings(): Promise<Settings | null> {
    return this.settingsRepository.get();
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings | null> {
    return this.settingsRepository.update(settings);
  }

  async setTheme(theme: Theme): Promise<Settings | null> {
    return this.settingsRepository.updateTheme(theme);
  }

  async setGlassEffect(enabled: boolean): Promise<Settings | null> {
    return this.settingsRepository.updateGlassEffect(enabled);
  }

  async setTransparency(transparency: number): Promise<Settings | null> {
    return this.settingsRepository.updateTransparency(transparency);
  }

  async setSortType(sortType: SortType): Promise<Settings | null> {
    return this.settingsRepository.updateSortType(sortType);
  }

  async setReminderEnabled(enabled: boolean): Promise<Settings | null> {
    return this.settingsRepository.updateReminderEnabled(enabled);
  }

  async setReminderOffset(offset: number): Promise<Settings | null> {
    return this.settingsRepository.updateReminderOffset(offset);
  }
}
