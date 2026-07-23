import Database from '@tauri-apps/plugin-sql';
import { Folder, FolderWithTasks } from '../data/types';
import { FolderRepository, TaskRepository } from '../data/repositories';
import { generateId, buildTaskTree } from '../data/utils';

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
    const id = generateId();
    const folders = await this.folderRepository.getByParentId(parentId);
    const sortOrder = folders.length;

    return this.folderRepository.create({
      id,
      name,
      parentId,
      sortOrder,
    });
  }

  async updateFolder(id: string, name: string): Promise<Folder | null> {
    return this.folderRepository.update({ id, name });
  }

  async deleteFolder(id: string): Promise<boolean> {
    return this.folderRepository.delete(id);
  }

  async updateSortOrder(folderId: string, newSortOrder: number): Promise<boolean> {
    return this.folderRepository.updateSortOrder(folderId, newSortOrder);
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
