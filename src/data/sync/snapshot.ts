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
  }));

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    exportedAt: Date.now(),
    deviceId,
    folders: syncFolders,
    tasks: syncTasks,
  };
}

/** 解析快照 JSON 并做基础校验；校验失败时抛出带明确信息的 Error */
export function parseSnapshot(json: string): SyncSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // JSON.parse 的报错信息不含原始内容上下文，包装一层便于定位问题
    throw new Error('同步快照解析失败：不是合法的 JSON');
  }

  const snapshot = parsed as Partial<SyncSnapshot>;

  // 版本不符必须拒绝：旧/新版本结构可能不兼容，静默接受会导致数据错乱
  if (snapshot.schemaVersion !== SYNC_SCHEMA_VERSION) {
    throw new Error(
      `同步快照版本不兼容：文件版本为 ${String(snapshot.schemaVersion)}，当前应用仅支持版本 ${SYNC_SCHEMA_VERSION}`
    );
  }

  // folders/tasks 是快照的数据主体，缺失时快照无意义
  if (!Array.isArray(snapshot.folders) || !Array.isArray(snapshot.tasks)) {
    throw new Error('同步快照结构无效：缺少 folders 或 tasks 数组');
  }

  // 布尔字段（completed/deleted）在 JSON 中本身就是 true/false，无需转换
  return snapshot as SyncSnapshot;
}

/** 序列化快照为带缩进的 JSON（便于人工审查 diff/版本对比） */
export function snapshotToJson(snapshot: SyncSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
