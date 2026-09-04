/** 内置 WebDAV 服务器（坚果云免费空间）：服务器地址无需用户输入，只填账号与应用密码 */
export const DEFAULT_WEBDAV_URL = 'https://dav.jianguoyun.com/dav/';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  /** 软删墓碑：0/1，已删除记录用于跨端同步传播 */
  deleted: boolean;
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
  /** 手动排序序号（同容器内递增；创建时追加到末尾） */
  sortOrder: number;
  completed: boolean;
  completedAt: number | null;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export type Theme = 'light' | 'dark';

export type SortType = 'deadline' | 'name' | 'createdAt' | 'manual';

/** 视图模式：列表 / 日历 / 日 */
export type ViewMode = 'list' | 'calendar' | 'day';

export interface Settings {
  id: string;
  theme: Theme;
  glassEffect: boolean;
  transparency: number;
  sortType: SortType;
  /** 重要任务置顶：标注"重要"的任务始终排在同容器前列 */
  importantTop: boolean;
  reminderEnabled: boolean;
  reminderOffset: number;
  /** 提醒后自动置顶：任务到达提醒时间后自动标记"重要"置顶显示 */
  autoPin: boolean;
  /** 开机自启动：注册到 Windows 登录时启动项（tauri-plugin-autostart） */
  autoStart: boolean;
  /** 截止时间按日期渐变：开启时纯白→#FF3333 渐变，关闭时直接显示红色 */
  deadlineGradient: boolean;
  /** 当前视图模式，默认 list */
  viewMode: ViewMode;
  /** 自动同步开关：开启时启动/变更防抖/定时自动同步，默认 true */
  autoSync: boolean;
  /** WebDAV 服务器地址（如 https://dav.jianguoyun.com/dav/），默认 '' */
  webdavUrl: string;
  /** WebDAV 账号，默认 '' */
  webdavUsername: string;
  /** WebDAV 密码，仅保存在本机数据库，默认 '' */
  webdavPassword: string;
  /** 上次成功同步时间戳（毫秒），null 表示尚未同步过 */
  lastSyncedAt: number | null;
  /** 上次成功同步操作：upload=上传（首次同步）/ download=下载 / merged=双向合并，null 表示尚未同步过 */
  lastSyncAction: 'upload' | 'download' | 'merged' | null;
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