import { getDatabase } from '../database';
import { FolderRepository, TaskRepository } from '../repositories';
import { buildSnapshot } from './snapshot';
import { SyncSnapshot } from './types';

/**
 * 导出本地全量数据为同步快照。
 * 注意：TaskRepository.getAll() 仅返回未删除任务（deleted = 0），
 * 因此快照中的任务 deleted 字段恒为 false——已删除任务本地软删、不进入快照；
 * 删除状态的跨端同步留待 Task 5 同步引擎在导入/合并时处理。
 */
export async function exportLocalSnapshot(deviceId: string): Promise<SyncSnapshot> {
  const db = await getDatabase();
  const folders = await new FolderRepository(db).getAll();
  const tasks = await new TaskRepository(db).getAll();
  return buildSnapshot(folders, tasks, deviceId);
}
