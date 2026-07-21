import Database from 'better-sqlite3';
import { Folder, FolderWithTasks, Task, TaskWithSubtasks } from '../data/types';
import { FolderRepository, TaskRepository } from '../data/repositories';

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
    const id = this.generateId();
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
    const taskTree = this.buildTaskTree(tasks);

    return {
      ...folder,
      tasks: taskTree,
    };
  }

  getAllFoldersWithTasks(): FolderWithTasks[] {
    const folders = this.folderRepository.getAll();
    
    return folders.map((folder) => {
      const tasks = this.taskRepository.getByFolderId(folder.id);
      const taskTree = this.buildTaskTree(tasks);
      return {
        ...folder,
        tasks: taskTree,
      };
    });
  }

  private buildTaskTree(tasks: Task[]): TaskWithSubtasks[] {
    const taskMap = new Map<string, TaskWithSubtasks>();
    const rootTasks: TaskWithSubtasks[] = [];

    tasks.forEach((task) => {
      taskMap.set(task.id, { ...task, subtasks: [] });
    });

    tasks.forEach((task) => {
      const taskWithSubtasks = taskMap.get(task.id)!;
      
      if (task.parentId && taskMap.has(task.parentId)) {
        taskMap.get(task.parentId)!.subtasks.push(taskWithSubtasks);
      } else {
        rootTasks.push(taskWithSubtasks);
      }
    });

    return rootTasks;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}