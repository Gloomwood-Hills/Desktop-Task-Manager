import Database from 'better-sqlite3';
import { Folder, FolderWithTasks } from '../data/types';
import { FolderRepository, TaskRepository } from '../data/repositories';
import { generateId, buildTaskTree } from '../data/utils';

export class FolderService {
  private folderRepository: FolderRepository;
  private taskRepository: TaskRepository;

  constructor(db: Database.Database) {
    this.folderRepository = new FolderRepository(db);
    this.taskRepository = new TaskRepository(db);
  }

  getAllFolders(): Folder[] {
    return this.folderRepository.getAll();
  }

  getFolderById(id: string): Folder | null {
    return this.folderRepository.getById(id);
  }

  getByParentId(parentId: string | null): Folder[] {
    return this.folderRepository.getByParentId(parentId);
  }

  createFolder(name: string, parentId: string | null = null): Folder {
    const id = generateId();
    const folders = this.folderRepository.getByParentId(parentId);
    const sortOrder = folders.length;

    return this.folderRepository.create({
      id,
      name,
      parentId,
      sortOrder,
    });
  }

  updateFolder(id: string, name: string): Folder | null {
    return this.folderRepository.update({ id, name });
  }

  deleteFolder(id: string): boolean {
    return this.folderRepository.delete(id);
  }

  updateSortOrder(folderId: string, newSortOrder: number): boolean {
    return this.folderRepository.updateSortOrder(folderId, newSortOrder);
  }

  getFolderWithTasks(folderId: string): FolderWithTasks | null {
    const folder = this.folderRepository.getById(folderId);
    if (!folder) return null;

    const tasks = this.taskRepository.getByFolderId(folderId);
    const taskTree = buildTaskTree(tasks);

    return {
      ...folder,
      tasks: taskTree,
    };
  }

  getAllFoldersWithTasks(): FolderWithTasks[] {
    const folders = this.folderRepository.getAll();
    
    return folders.map((folder) => {
      const tasks = this.taskRepository.getByFolderId(folder.id);
      const taskTree = buildTaskTree(tasks);
      return {
        ...folder,
        tasks: taskTree,
      };
    });
  }
}