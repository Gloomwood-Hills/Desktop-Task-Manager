import { Task, TaskWithSubtasks } from './types';

export function mapBooleanFields<T extends object>(
  row: T,
  booleanFields: (keyof T)[]
): T {
  const result = { ...row };

  for (const key of booleanFields) {
    if (result[key] === 1) {
      result[key] = true as unknown as T[keyof T];
    } else if (result[key] === 0) {
      result[key] = false as unknown as T[keyof T];
    }
  }

  return result;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function parseJSONField<T>(value: string | T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value as unknown as T;
    }
  }
  return value;
}

export function buildTaskTree(tasks: Task[]): TaskWithSubtasks[] {
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