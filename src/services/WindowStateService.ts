import Database from 'better-sqlite3';
import { WindowState } from '../data/types';
import { WindowStateRepository } from '../data/repositories';

export class WindowStateService {
  private windowStateRepository: WindowStateRepository;

  constructor(db: Database.Database) {
    this.windowStateRepository = new WindowStateRepository(db);
  }

  getWindowState(): WindowState | null {
    return this.windowStateRepository.get();
  }

  saveWindowState(windowState: Partial<WindowState>): WindowState | null {
    return this.windowStateRepository.update(windowState);
  }

  savePosition(x: number, y: number): WindowState | null {
    return this.windowStateRepository.updatePosition(x, y);
  }

  saveSize(width: number, height: number): WindowState | null {
    return this.windowStateRepository.updateSize(width, height);
  }

  saveCollapsedFolders(folderIds: string[]): WindowState | null {
    return this.windowStateRepository.updateCollapsedFolders(folderIds);
  }
}