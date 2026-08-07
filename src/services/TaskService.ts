import Database from '@tauri-apps/plugin-sql';
import { Task, TaskWithSubtasks, Priority } from '../data/types';
import { TaskRepository } from '../data/repositories';
import { generateId, buildTaskTree } from '../data/utils';

export class TaskService {
  private taskRepository: TaskRepository;

  constructor(db: Database) {
    this.taskRepository = new TaskRepository(db);
  }

  async getAllTasks(): Promise<Task[]> {
    return this.taskRepository.getAll();
  }

  async getTaskById(id: string): Promise<Task | null> {
    return this.taskRepository.getById(id);
  }

  async getTasksByFolderId(folderId: string): Promise<Task[]> {
    return this.taskRepository.getByFolderId(folderId);
  }

  async getCompletedTasks(folderId?: string): Promise<Task[]> {
    return this.taskRepository.getCompleted(folderId);
  }

  async createTask(
    title: string,
    folderId: string | null,
    options?: {
      remark?: string;
      parentId?: string | null;
      startDate?: number | null;
      deadline?: number | null;
      priority?: Priority;
    }
  ): Promise<Task> {
    const id = generateId();

    return this.taskRepository.create({
      id,
      title,
      remark: options?.remark || '',
      folderId,
      parentId: options?.parentId || null,
      startDate: options?.startDate || null,
      deadline: options?.deadline || null,
      priority: options?.priority || 'normal',
    });
  }

  async updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'startDate' | 'deadline' | 'priority'>>): Promise<Task | null> {
    return this.taskRepository.update(id, updates);
  }

  /** 手动排序：按给定顺序持久化任务顺序 */
  async reorderTasks(orderedIds: string[]): Promise<boolean> {
    return this.taskRepository.reorderTasks(orderedIds);
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.taskRepository.softDelete(id);
  }

  async restoreTask(id: string): Promise<boolean> {
    return this.taskRepository.restore(id);
  }

  async toggleTaskCompleted(id: string): Promise<Task | null> {
    const task = await this.taskRepository.getById(id);
    if (!task) return null;

    const newCompleted = !task.completed;
    const updated = await this.taskRepository.markCompleted(id, newCompleted);

    if (updated && updated.parentId) {
      await this.updateParentCompletion(updated.parentId);
    }

    return updated;
  }

  async getParentTaskCompletion(parentId: string): Promise<{ completed: number; total: number }> {
    const total = await this.taskRepository.getSubtaskCount(parentId);
    const completed = await this.taskRepository.getCompletedSubtaskCount(parentId);
    return { completed, total };
  }

  private async updateParentCompletion(parentId: string): Promise<void> {
    const { completed, total } = await this.getParentTaskCompletion(parentId);

    if (total > 0) {
      const allCompleted = completed === total;
      const parentTask = await this.taskRepository.markCompleted(parentId, allCompleted);

      if (parentTask && parentTask.parentId) {
        await this.updateParentCompletion(parentTask.parentId);
      }
    }
  }

  buildTaskTree(tasks: Task[]): TaskWithSubtasks[] {
    return buildTaskTree(tasks);
  }
}
