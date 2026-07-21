import Database from 'better-sqlite3';
import { Task, TaskWithSubtasks, Priority } from '../data/types';
import { TaskRepository } from '../data/repositories';

export class TaskService {
  private taskRepository: TaskRepository;

  constructor(db: Database.Database) {
    this.taskRepository = new TaskRepository(db);
  }

  getAllTasks(): Task[] {
    return this.taskRepository.getAll();
  }

  getTaskById(id: string): Task | null {
    return this.taskRepository.getById(id);
  }

  getTasksByFolderId(folderId: string): Task[] {
    return this.taskRepository.getByFolderId(folderId);
  }

  getCompletedTasks(folderId?: string): Task[] {
    return this.taskRepository.getCompleted(folderId);
  }

  createTask(
    title: string,
    folderId: string,
    options?: {
      remark?: string;
      parentId?: string | null;
      startDate?: number | null;
      deadline?: number | null;
      priority?: Priority;
    }
  ): Task {
    const id = this.generateId();

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

  updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'startDate' | 'deadline' | 'priority'>>): Task | null {
    return this.taskRepository.update(id, updates);
  }

  deleteTask(id: string): boolean {
    return this.taskRepository.softDelete(id);
  }

  restoreTask(id: string): boolean {
    return this.taskRepository.restore(id);
  }

  toggleTaskCompleted(id: string): Task | null {
    const task = this.taskRepository.getById(id);
    if (!task) return null;

    const newCompleted = !task.completed;
    const updated = this.taskRepository.markCompleted(id, newCompleted);

    if (updated && updated.parentId) {
      this.updateParentCompletion(updated.parentId);
    }

    return updated;
  }

  getParentTaskCompletion(parentId: string): { completed: number; total: number } {
    const total = this.taskRepository.getSubtaskCount(parentId);
    const completed = this.taskRepository.getCompletedSubtaskCount(parentId);
    return { completed, total };
  }

  private updateParentCompletion(parentId: string): void {
    const { completed, total } = this.getParentTaskCompletion(parentId);
    
    if (total > 0) {
      const allCompleted = completed === total;
      const parentTask = this.taskRepository.markCompleted(parentId, allCompleted);

      if (parentTask && parentTask.parentId) {
        this.updateParentCompletion(parentTask.parentId);
      }
    }
  }

  buildTaskTree(tasks: Task[]): TaskWithSubtasks[] {
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