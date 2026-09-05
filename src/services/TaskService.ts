import Database from '@tauri-apps/plugin-sql';
import { Task, TaskWithSubtasks, Priority, TaskRepeatRule } from '../data/types';
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
      reminderAt?: number | null;
      repeatRule?: TaskRepeatRule | null;
      repeatIntervalDays?: number | null;
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
      reminderAt: options?.reminderAt ?? null,
      repeatRule: options?.repeatRule ?? null,
      repeatIntervalDays: options?.repeatIntervalDays ?? null,
      // 带重复规则的任务：首实例以自身 id 作为系列标识（模板也计入"累计完成x次"）
      repeatSeriesId: options?.repeatRule ? id : null,
    });
  }

  async updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'startDate' | 'deadline' | 'priority' | 'reminderAt' | 'reminderFired' | 'repeatRule' | 'repeatIntervalDays'>>): Promise<Task | null> {
    return this.taskRepository.update(id, updates);
  }

  /** 手动排序：按给定顺序持久化任务顺序 */
  async reorderTasks(orderedIds: string[]): Promise<boolean> {
    return this.taskRepository.reorderTasks(orderedIds);
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.taskRepository.softDelete(id);
  }

  /** 读取已删除任务（30 天保留期内） */
  async getAllDeleted(): Promise<Task[]> {
    return this.taskRepository.getAllDeleted();
  }

  /** 物理清除超过保留期的已删除任务（deleted=1 且 updatedAt <= threshold），返回清除条数 */
  async purgeDeleted(thresholdMs: number): Promise<number> {
    return this.taskRepository.purgeDeleted(thresholdMs);
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

    // 重复任务：完成上一实例后自动生成下一实例并顺延截止（V2.1.2）
    if (updated && newCompleted && task.repeatRule && task.deadline) {
      await this.spawnNextInstance(task);
    }

    return updated;
  }

  /** 计算下一次截止时间（重复规则） */
  private static nextDeadline(deadline: number, rule: TaskRepeatRule, intervalDays: number | null): number {
    const d = new Date(deadline);
    const addDays = (n: number) => {
      const x = new Date(deadline); x.setDate(x.getDate() + n); return x.getTime();
    };
    const addMonths = (n: number) => {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      return d.getTime();
    };
    const addYears = (n: number) => {
      const m = d.getMonth(); const day = d.getDate();
      d.setFullYear(d.getFullYear() + n);
      const last = new Date(d.getFullYear(), m + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      return d.getTime();
    };
    switch (rule) {
      case 'daily': return addDays(1);
      case 'weekly': return addDays(7);
      case 'monthly': return addMonths(1);
      case 'yearly': return addYears(1);
      case 'custom': return addDays(Math.max(1, intervalDays ?? 1));
      default: return deadline;
    }
  }

  /** 生成重复任务的下一实例（复制标题/备注/优先级/容器，截止顺延，不重复的提醒清空，继承重复系列） */
  private async spawnNextInstance(task: Task): Promise<Task | null> {
    const next = TaskService.nextDeadline(task.deadline!, task.repeatRule!, task.repeatIntervalDays);
    return this.taskRepository.create({
      id: generateId(),
      title: task.title,
      remark: task.remark,
      folderId: task.folderId,
      parentId: task.parentId,
      startDate: null,
      deadline: next,
      priority: task.priority,
      reminderAt: null,
      repeatRule: task.repeatRule,
      repeatIntervalDays: task.repeatIntervalDays,
      repeatSeriesId: task.repeatSeriesId ?? task.id,
    });
  }

  /** 统计同一重复系列已完成的实例数（用于"已重复 N 次"） */
  async countRepeatDone(seriesId: string): Promise<number> {
    return this.taskRepository.getCompletedCountBySeries(seriesId);
  }

  /** 结束重复：清除该任务的重复规则（不再生成下一实例） */
  async stopRepeat(id: string): Promise<Task | null> {
    return this.taskRepository.update(id, { repeatRule: null, repeatIntervalDays: null });
  }

  /** 读取提醒时间已到且未触发、未完成、未删除的任务 */
  async getDueReminders(now: number): Promise<Task[]> {
    return this.taskRepository.getDueReminders(now);
  }

  /** 标记提醒已触发 */
  async markReminderFired(id: string): Promise<boolean> {
    return this.taskRepository.markReminderFired(id);
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
