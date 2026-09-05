/**
 * 云同步模块的类型定义。
 * 快照（SyncSnapshot）是本地任务数据（文件夹/任务/子任务）导出的版本化 JSON，
 * 供 WebDAV 双向同步使用；同步设置放在本文件，避免改动 src/data/types.ts。
 */

/**
 * 快照结构版本号：结构变更时必须递增。
 * v1: 基础字段
 * v2: SyncFolder 含 deleted 墓碑
 * v3: SyncTask 补全重复任务字段（repeatRule/repeatIntervalDays/repeatSeriesId/repeatNextId）
 *     与提醒字段（reminderAt/reminderFired）——此前同步会把这些字段清空为 NULL，
 *     导致重复任务撤销清理失效、提醒丢失。v1/v2 快照兼容导入（缺字段补默认值）。
 */
export const SYNC_SCHEMA_VERSION = 3;

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
  /** 软删墓碑：true=已删除，供跨端删除传播 */
  deleted: boolean;
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
  /** 重复规则（daily/weekly/monthly/yearly/custom），null=不重复 */
  repeatRule: string | null;
  /** 自定义重复间隔（天），仅 repeatRule=custom 时有意义 */
  repeatIntervalDays: number | null;
  /** 重复系列标识（首实例的 id），同一系列所有实例共享；用于撤销完成时清理同系列未完成实例 */
  repeatSeriesId: string | null;
  /** 自动生成的下一实例 id（完成时写入，撤销完成时清理），单链关联，防御性回退用 */
  repeatNextId: string | null;
  /** 提醒时间戳（毫秒），null=无提醒 */
  reminderAt: number | null;
  /** 提醒是否已触发（避免重复通知） */
  reminderFired: boolean;
}
