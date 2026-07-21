import Database from 'better-sqlite3';
import { Settings, Theme, SortType } from '../data/types';
import { SettingsRepository } from '../data/repositories';

export class SettingsService {
  private settingsRepository: SettingsRepository;

  constructor(db: Database.Database) {
    this.settingsRepository = new SettingsRepository(db);
  }

  getSettings(): Settings | null {
    return this.settingsRepository.get();
  }

  updateSettings(settings: Partial<Settings>): Settings | null {
    return this.settingsRepository.update(settings);
  }

  setTheme(theme: Theme): Settings | null {
    return this.settingsRepository.updateTheme(theme);
  }

  setGlassEffect(enabled: boolean): Settings | null {
    return this.settingsRepository.updateGlassEffect(enabled);
  }

  setTransparency(transparency: number): Settings | null {
    return this.settingsRepository.updateTransparency(transparency);
  }

  setSortType(sortType: SortType): Settings | null {
    return this.settingsRepository.updateSortType(sortType);
  }

  setReminderEnabled(enabled: boolean): Settings | null {
    return this.settingsRepository.updateReminderEnabled(enabled);
  }

  setReminderOffset(offset: number): Settings | null {
    return this.settingsRepository.updateReminderOffset(offset);
  }
}