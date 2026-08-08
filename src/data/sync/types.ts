/**
 * 云同步模块的类型定义。
 * 快照（SyncSnapshot）是本地任务数据（文件夹/任务/子任务）导出的版本化 JSON，
 * 供 WebDAV 双向同步使用；同步设置放在本文件，避免改动 src/data/types.ts。
 */

/** 快照结构版本号：结构变更时必须递增，旧版本快照应拒绝导入 */
export const SYNC_SCHEMA_VERSION = 1;

/** WebDAV 同步设置（密码仅本地保存，禁止写入 git/远端） */
export interface SyncSettings {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
}

/** 一次导出的完整数据快照（与本地库解耦的传输格式） */
export interface SyncSnapshot {
  schemaVersion: number;
  /** 导出时间戳（毫秒） */
  exportedAt: number;
  /** 设备标识（可简化，用于区分多端来源） */
  deviceId: string;
  folders: SyncFolder[];
  tasks: SyncTask[];
}

export interface SyncFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface SyncTask {
  id: string;
  title: string;
  remark: string;
  folderId: string | null;
  parentId: string | null;
  startDate: number | null;
  deadline: number | null;
  priority: string;
  sortOrder: number;
  completed: boolean;
  completedAt: number | null;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}
