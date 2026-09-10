import Database from '@tauri-apps/plugin-sql';
import { Folder, FolderWithTasks } from '../data/types';
import { FolderRepository, TaskRepository } from '../data/repositories';
import { generateId, buildTaskTree } from '../data/utils';

/** 文件夹名称最大字数 */
export const FOLDER_NAME_MAX = 20;

export class FolderService {
  private folderRepository: FolderRepository;
  private taskRepository: TaskRepository;

  constructor(db: Database) {
    this.folderRepository = new FolderRepository(db);
    this.taskRepository = new TaskRepository(db);
  }

  async getAllFolders(): Promise<Folder[]> {
    return this.folderRepository.getAll();
  }

  async getFolderById(id: string): Promise<Folder | null> {
    return this.folderRepository.getById(id);
  }

  async getByParentId(parentId: string | null): Promise<Folder[]> {
    return this.folderRepository.getByParentId(parentId);
  }

  async createFolder(name: string, parentId: string | null = null): Promise<Folder> {
    if (name.trim().length > FOLDER_NAME_MAX) {
      throw new Error(`文件夹名称不能超过 ${FOLDER_NAME_MAX} 字`);
    }
    const id = generateId();
    const folders = await this.folderRepository.getByParentId(parentId);
    const sortOrder = folders.length;

    return this.folderRepository.create({
      id,
      name: name.trim(),
      parentId,
      sortOrder,
      deleted: false,
    });
  }

  async updateFolder(id: string, name: string): Promise<Folder | null> {
    if (name.trim().length > FOLDER_NAME_MAX) {
      throw new Error(`文件夹名称不能超过 ${FOLDER_NAME_MAX} 字`);
    }
    return this.folderRepository.update({ id, name: name.trim() });
  }

  async deleteFolder(id: string): Promise<boolean> {
    return this.folderRepository.delete(id);
  }

  async updateSortOrder(folderId: string, newSortOrder: number): Promise<boolean> {
    return this.folderRepository.updateSortOrder(folderId, newSortOrder);
  }

  /** 手动排序：按给定顺序持久化同级文件夹顺序 */
  async reorderFolders(orderedIds: string[]): Promise<boolean> {
    return this.folderRepository.reorderFolders(orderedIds);
  }

  async getFolderWithTasks(folderId: string): Promise<FolderWithTasks | null> {
    const folder = await this.folderRepository.getById(folderId);
    if (!folder) return null;

    const tasks = await this.taskRepository.getByFolderId(folderId);
    const taskTree = buildTaskTree(tasks);

    return {
      ...folder,
      tasks: taskTree,
    };
  }

  async getAllFoldersWithTasks(): Promise<FolderWithTasks[]> {
    const folders = await this.folderRepository.getAll();

    const results: FolderWithTasks[] = [];
    for (const folder of folders) {
      const tasks = await this.taskRepository.getByFolderId(folder.id);
      const taskTree = buildTaskTree(tasks);
      results.push({
        ...folder,
        tasks: taskTree,
      });
    }
    return results;
  }
}
