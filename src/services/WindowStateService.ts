import Database from '@tauri-apps/plugin-sql';
import { WindowState } from '../data/types';
import { WindowStateRepository } from '../data/repositories';

export class WindowStateService {
  private windowStateRepository: WindowStateRepository;

  constructor(db: Database) {
    this.windowStateRepository = new WindowStateRepository(db);
  }

  async getWindowState(): Promise<WindowState | null> {
    return this.windowStateRepository.get();
  }

  async saveWindowState(windowState: Partial<WindowState>): Promise<WindowState | null> {
    return this.windowStateRepository.update(windowState);
  }

  async savePosition(x: number, y: number): Promise<WindowState | null> {
    return this.windowStateRepository.updatePosition(x, y);
  }

  async saveSize(width: number, height: number): Promise<WindowState | null> {
    return this.windowStateRepository.updateSize(width, height);
  }

  async saveCollapsedFolders(folderIds: string[]): Promise<WindowState | null> {
    return this.windowStateRepository.updateCollapsedFolders(folderIds);
  }
}
