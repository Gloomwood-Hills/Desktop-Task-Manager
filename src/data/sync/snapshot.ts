import { Folder, Task } from '../types';
import { SYNC_SCHEMA_VERSION, SyncFolder, SyncSnapshot, SyncTask } from './types';

/**
 * 将应用数据层类型（Folder/Task）转换为同步快照。
 * 显式逐字段映射而非直接展开，避免后续 Task/Folder 类型变更时
 * 悄悄改变快照结构（快照是跨版本持久化的传输格式，字段必须受控）。
 */
export function buildSnapshot(folders: Folder[], tasks: Task[], deviceId: string): SyncSnapshot {
  const syncFolders: SyncFolder[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deleted: folder.deleted,
  }));

  const syncTasks: SyncTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    remark: task.remark,
    folderId: task.folderId,
    parentId: task.parentId,
    startDate: task.startDate,
    deadline: task.deadline,
    priority: task.priority,
    sortOrder: task.sortOrder,
    completed: task.completed,
    completedAt: task.completedAt,
    deleted: task.deleted,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    // v3 补全：重复任务字段 + 单值提醒字段（此前同步会清空这些字段，导致重复撤销失效、提醒丢失）
    repeatRule: task.repeatRule ?? null,
    repeatIntervalDays: task.repeatIntervalDays ?? null,
    repeatSeriesId: task.repeatSeriesId ?? null,
    repeatNextId: task.repeatNextId ?? null,
    reminderAt: task.reminderAt ?? null,
    reminderFired: task.reminderFired ?? false,
    // v4 补全：多提醒偏移字段（之前漏导，导致偏移/已触发状态跨端丢失，提醒重复）
    reminderOffsets: task.reminderOffsets ?? [],
    reminderFiredOffsets: task.reminderFiredOffsets ?? [],
    // v5 补全：多选绝对提醒时刻字段
    reminderTimes: task.reminderTimes ?? [],
    reminderFiredTimes: task.reminderFiredTimes ?? [],
  }));

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    exportedAt: Date.now(),
    deviceId,
    folders: syncFolders,
    tasks: syncTasks,
  };
}

/** 解析快照 JSON 并做基础校验；校验失败时抛出带明确信息的 Error。
 * 兼容 v1 ~ v5：
 * - v1 文件夹无 deleted 字段，解析时统一补 deleted=false；
 * - v1/v2 任务无重复任务/提醒字段（repeatRule/repeatSeriesId/repeatNextId/reminderAt/reminderFired 等），
 *   统一补 null/false；
 * - v1/v2/v3/v4 任务无多提醒字段（reminderOffsets/reminderFiredOffsets/reminderTimes/reminderFiredTimes），统一补 []；
 * 规范化后统一按 v5 结构返回。其他版本结构可能不兼容，直接拒绝。 */
export function parseSnapshot(json: string): SyncSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // JSON.parse 的报错信息不含原始内容上下文，包装一层便于定位问题
    throw new Error('同步快照解析失败：不是合法的 JSON');
  }

  const snapshot = parsed as Partial<SyncSnapshot>;

  // 版本兼容范围：v1（Folder 无 deleted）/v2（Folder 含 deleted）/v3（Task 含重复+单值提醒字段）
  // /v4（Task 含多提醒偏移字段）/v5（Task 含多选提醒字段）均可接受，统一规范化为 v5 结构；
  // 其他版本结构可能不兼容，静默接受会导致数据错乱。
  const supported = [1, 2, 3, 4, 5];
  if (!supported.includes(snapshot.schemaVersion ?? 0)) {
    throw new Error(
      `同步快照版本不兼容：文件版本为 ${String(snapshot.schemaVersion)}，当前应用仅支持版本 1/2/3/4/5`
    );
  }

  // folders/tasks 是快照的数据主体，缺失时快照无意义
  if (!Array.isArray(snapshot.folders) || !Array.isArray(snapshot.tasks)) {
    throw new Error('同步快照结构无效：缺少 folders 或 tasks 数组');
  }

  // v1 → v2 规范化：v1 文件夹无 deleted 字段，补 false（v1 任务已含 deleted，无需处理）
  if (snapshot.schemaVersion === 1) {
    snapshot.folders.forEach((folder) => {
      folder.deleted = false;
    });
  }

  // v1/v2 → v3 规范化：旧快照任务无重复任务/提醒字段，统一补默认值
  // （repeatRule/repeatIntervalDays/repeatSeriesId/repeatNextId/reminderAt → null；reminderFired → false）
  // v1/v2/v3/v4 → v5 规范化：旧快照任务无多提醒字段，统一补 []
  snapshot.tasks.forEach((task) => {
    const t = task as unknown as Record<string, unknown>;
    if (t.repeatRule === undefined) t.repeatRule = null;
    if (t.repeatIntervalDays === undefined) t.repeatIntervalDays = null;
    if (t.repeatSeriesId === undefined) t.repeatSeriesId = null;
    if (t.repeatNextId === undefined) t.repeatNextId = null;
    if (t.reminderAt === undefined) t.reminderAt = null;
    if (t.reminderFired === undefined) t.reminderFired = false;
    if (t.reminderOffsets === undefined) t.reminderOffsets = [];
    if (t.reminderFiredOffsets === undefined) t.reminderFiredOffsets = [];
    if (t.reminderTimes === undefined) t.reminderTimes = [];
    if (t.reminderFiredTimes === undefined) t.reminderFiredTimes = [];
  });

  // 统一按 v5 结构返回：schemaVersion 一并提升，避免下游出现"旧版本号 + v5 结构"的混合态
  return { ...snapshot, schemaVersion: SYNC_SCHEMA_VERSION } as SyncSnapshot;
}

/** 序列化快照为无缩进的紧凑 JSON（配合 gzip 压缩传输：去掉空白缩进可进一步减小体积，
 * 压缩后通常只剩原文 1/10 左右，节省坚果云免费版上传/下载配额） */
export function snapshotToJson(snapshot: SyncSnapshot): string {
  return JSON.stringify(snapshot);
}
