import { Task, TaskWithSubtasks, Folder, FolderNode, SortType } from './types';

export function mapBooleanFields<T extends object>(
  row: T,
  booleanFields: (keyof T)[]
): T {
  const result = { ...row };

  for (const key of booleanFields) {
    // SQLite drivers may expose INTEGER booleans as numbers or as strings
    // (Android builds have returned both forms).  Normalize both so a string
    // value of "0" cannot be treated as truthy by the React view layer.
    const value = result[key];
    if (value === true || value === 1 || value === '1') {
      result[key] = true as unknown as T[keyof T];
    } else if (value === false || value === 0 || value === '0') {
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
 * 名称排序比较器（A-Z 直觉排序，适合中英文混排）：
 * - 拉丁字母开头在前（不区分大小写 A-Z）
 * - 数字开头次之（按数值）
 * - 中文开头最后（按拼音）
 */
export function compareByName(a: string, b: string): number {
  const rank = (s: string): number => (/^[A-Za-z]/.test(s) ? 0 : /^[0-9]/.test(s) ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al !== bl) return al < bl ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (ra === 1) {
    const na = Number(a.match(/^\d+/)?.[0] ?? 0);
    const nb = Number(b.match(/^\d+/)?.[0] ?? 0);
    if (na !== nb) return na - nb;
  }
  return a.localeCompare(b, 'zh');
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
        return arr.sort((a, b) => compareByName(a.title, b.title));
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

/**
 * 按设置排序文件夹（同级）
 * - manual 维持 sortOrder 顺序；deadline 无自然语义，按名称兜底
 * - 与 sortTasksByType 配合：未分类任务与文件夹在顶层按同种排序方式混排
 */
export function sortFolders<T extends Folder>(folders: T[], sortType: SortType): T[] {
  const list = [...folders];
  switch (sortType) {
    case 'name':
    case 'deadline':
      return list.sort((a, b) => compareByName(a.name, b.name));
    case 'createdAt':
      return list.sort((a, b) => b.createdAt - a.createdAt);
    case 'manual':
    default:
      return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
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
