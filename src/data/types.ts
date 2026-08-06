export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type Priority = 'normal' | 'important';

export interface Task {
  id: string;
  title: string;
  remark: string;
  /** null 表示未分类任务（顶层显示） */
  folderId: string | null;
  parentId: string | null;
  startDate: number | null;
  deadline: number | null;
  priority: Priority;
  completed: boolean;
  completedAt: number | null;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export type Theme = 'light' | 'dark';

export type SortType = 'deadline' | 'priority' | 'name' | 'createdAt' | 'manual';

export interface Settings {
  id: string;
  theme: Theme;
  glassEffect: boolean;
  transparency: number;
  sortType: SortType;
  reminderEnabled: boolean;
  reminderOffset: number;
  createdAt: number;
  updatedAt: number;
}

export interface WindowState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsedFolders: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TaskWithSubtasks extends Task {
  subtasks: TaskWithSubtasks[];
}

export interface FolderWithTasks extends Folder {
  tasks: TaskWithSubtasks[];
}

/** 文件夹树节点：文件夹 + 其直属任务树 + 子文件夹（递归） */
export interface FolderNode extends FolderWithTasks {
  children: FolderNode[];
}