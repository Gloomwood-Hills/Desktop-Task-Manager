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
 * v4: SyncTask 补全多提醒偏移字段（reminderOffsets/reminderFiredOffsets，本为 v3 遗漏，
 *     加导出后版本号递增对齐已实际落地的 parse 规范）。
 * v5: SyncTask 补全多选提醒字段（reminderTimes/reminderFiredTimes，绝对毫秒时刻数组）。
 */
export const SYNC_SCHEMA_VERSION = 5;

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
  /** 提醒时间戳（毫秒），null=无提醒。偏移提醒派生为最早的一个偏移时刻，兼容旧数据 */
  reminderAt: number | null;
  /** 提醒是否已触发（避免重复通知） */
  reminderFired: boolean;
  /** 提前提醒偏移配置（'1d' 提前一天 / '3d' 提前三天 / '6h' 提前6小时）；空数组表示未设提醒 */
  reminderOffsets: string[];
  /** 已触发通知的偏移 key（支持同一任务多个提前提醒逐个触发） */
  reminderFiredOffsets: string[];
  /** 多选提醒时刻（绝对毫秒时间戳）：日历可设置任意多个绝对提醒点，无需截止时间即可设置 */
  reminderTimes: number[];
  /** 已触发通知的提醒时刻值（对应 reminderTimes 多选，保证每个绝对时刻只通知一次） */
  reminderFiredTimes: number[];
}
