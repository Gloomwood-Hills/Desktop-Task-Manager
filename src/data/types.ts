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

/** 重复规则：daily 每天 / weekly 每周(按截止日星期) / monthly 每月(按截止日) / yearly 每年 / custom 每N天 */
export type TaskRepeatRule = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

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
  /** 提醒时间（毫秒）；null 表示未设提醒。偏移提醒派生为最早的一个偏移时刻，兼容旧数据 */
  reminderAt: number | null;
  /** 是否已触发过提醒（避免重复通知） */
  reminderFired: boolean;
  /** 提前提醒偏移配置（'1d' 提前一天 / '3d' 提前三天 / '6h' 提前6小时）；空数组表示未设提醒 */
  reminderOffsets: string[];
  /** 已触发通知的偏移 key（支持同一任务多个提前提醒逐个触发） */
  reminderFiredOffsets: string[];
  /** 多选提醒时刻（绝对毫秒时间戳）：日历右键/气泡可设置任意多个绝对提醒点，无需截止时间即可设置 */
  reminderTimes: number[];
  /** 已触发通知的提醒时刻值（对应 reminderTimes 多选，保证每个绝对时刻只通知一次） */
  reminderFiredTimes: number[];
  /** 重复规则；null 表示不重复 */
  repeatRule: TaskRepeatRule | null;
  /** 自定义重复的间隔天数（repeatRule=custom 时有效） */
  repeatIntervalDays: number | null;
  /** 重复系列标识：同一重复链的实例共享（首个实例生成下一实例时写入自身 id，便于统计已重复次数） */
  repeatSeriesId: string | null;
  /** 由本任务完成时自动生成的下一实例 id（用于撤销完成时删除该实例，避免重复任务/数据爆炸） */
  repeatNextId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type Theme = 'light' | 'dark';

export type SortType = 'deadline' | 'name' | 'createdAt' | 'manual';

/** 默认同步策略：双向合并 / 仅上传云端 / 仅覆盖本地（下载并覆盖本地） */
export type SyncPolicy = 'twoWay' | 'uploadOnly' | 'downloadOnly';

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
  /** 截止时间仅填日期未填具体时刻时，默认补上的"时"（0-23，默认 18） */
  defaultDeadlineHour: number;
  /** 截止时间仅填日期未填具体时刻时，默认补上的"分"（0-59，默认 0） */
  defaultDeadlineMinute: number;
  /** 当前视图模式，默认 list */
  viewMode: ViewMode;
  /** 自动同步开关：开启时启动/变更防抖/定时自动同步，默认 true */
  autoSync: boolean;
  /** 默认同步策略：twoWay 双向合并 / uploadOnly 仅上传云端 / downloadOnly 仅覆盖本地。默认 twoWay */
  syncPolicy: SyncPolicy;
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
  /** 已重复次数（同一重复系列已完成实例数），用于主视图展示 */
  repeatCount?: number;
}

export interface FolderWithTasks extends Folder {
  tasks: TaskWithSubtasks[];
}

/** 文件夹树节点：文件夹 + 其直属任务树 + 子文件夹（递归） */
export interface FolderNode extends FolderWithTasks {
  children: FolderNode[];
}