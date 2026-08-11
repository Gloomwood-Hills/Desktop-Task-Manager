import { getDatabase } from '../database';
import { FolderRepository, TaskRepository } from '../repositories';
import { selfCheckMerge } from './merge';
import { buildSnapshot } from './snapshot';
import { SyncSnapshot } from './types';

/**
 * 导出本地全量数据为同步快照。
 * 快照 v2 包含软删墓碑记录：Folder/Task 均用 getAllIncludingDeleted() 全量读取，
 * deleted=1 的记录一并进入快照，供跨端删除传播——合并引擎（merge.ts）按 updatedAt
 * 做 Last-Write-Wins，较新的删除墓碑会覆盖对端的存活记录，实现删除的跨端同步。
 */
export async function exportLocalSnapshot(deviceId: string): Promise<SyncSnapshot> {
  // 导出前先跑一遍合并引擎自检（纯函数断言，见 merge.ts），失败即抛错阻断导出，
  // 避免合并语义被破坏后数据在端间静默错乱（也防止该自检被 tree-shake 掉）。
  selfCheckMerge();
  const db = await getDatabase();
  const folders = await new FolderRepository(db).getAllIncludingDeleted();
  const tasks = await new TaskRepository(db).getAllIncludingDeleted();
  return buildSnapshot(folders, tasks, deviceId);
}
