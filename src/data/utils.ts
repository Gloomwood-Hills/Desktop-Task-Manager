import { Task, TaskWithSubtasks, Folder, FolderNode, SortType } from './types';

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

/**
 * 按设置排序任务列表
 * - manual 维持 sortOrder 顺序（原序）
 * - importantTop 为 true 时先按优先级分区（重要在前），再在各分区内按 sortType 排序
 *   （手动排序下重要/普通各自保持原序，仅整体分区置顶）
 */
export function sortTasksByType<T extends Task>(tasks: T[], sortType: SortType, importantTop = false): T[] {
  const sortCore = (arr: T[]): T[] => {
    switch (sortType) {
      case 'name':
        return arr.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
      case 'deadline':
        return arr.sort((a, b) => {
          if (a.deadline === null && b.deadline === null) return 0;
          if (a.deadline === null) return 1;
          if (b.deadline === null) return -1;
          return a.deadline - b.deadline;
        });
      case 'manual':
        return arr;
      case 'createdAt':
      default:
        return arr.sort((a, b) => b.createdAt - a.createdAt);
    }
  };

  const list = [...tasks];
  if (!importantTop) return sortCore(list);
  const important = list.filter((t) => t.priority === 'important');
  const normal = list.filter((t) => t.priority !== 'important');
  return [...sortCore(important), ...sortCore(normal)];
}

/** 从扁平 folders + tasks 构建 FolderNode 树 */
export function buildFolderTree(folders: Folder[], tasks: Task[]): FolderNode[] {
  const folderMap = new Map<string, FolderNode>();
  const rootNodes: FolderNode[] = [];

  folders.forEach((folder) => {
    folderMap.set(folder.id, { ...folder, tasks: [], children: [] });
  });

  folders.forEach((folder) => {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  const fillTasks = (node: FolderNode) => {
    const directTasks = tasks.filter(
      (t) => t.folderId === node.id && (t.parentId === null || !folderMap.has(t.parentId))
    );
    node.tasks = buildTaskTree(directTasks);
    node.children.forEach(fillTasks);
  };

  rootNodes.forEach(fillTasks);

  // 按 sortOrder 排序
  rootNodes.sort((a, b) => a.sortOrder - b.sortOrder);
  const sortChildren = (node: FolderNode) => {
    node.children.sort((a, b) => a.sortOrder - b.sortOrder);
    node.children.forEach(sortChildren);
  };
  rootNodes.forEach(sortChildren);

  return rootNodes;
}