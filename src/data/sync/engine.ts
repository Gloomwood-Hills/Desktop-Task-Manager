import { exportLocalSnapshot } from './exporter';
import { importMerged, importSnapshot } from './importer';
import { mergeFolders, mergeTasks } from './merge';
import { parseSnapshot, snapshotToJson } from './snapshot';
import { SyncSettings, SyncSnapshot, SYNC_SCHEMA_VERSION } from './types';
import { webdavFetch, webdavMkcol, webdavPut } from './webdavClient';

/** 远端备份文件的相对路径：放在坚果云「Desktop-task-manager」子文件夹中，便于用户管理。
 * 该目录在上传前会自动创建（MKCOL），无需用户手动建文件夹。 */
export const REMOTE_PATH = 'Desktop-task-manager/backup.json';

export interface SyncResult {
  status: 'uploaded' | 'downloaded' | 'merged' | 'skipped' | 'error';
  message: string;
}

export interface SyncProbe {
  remoteExists: boolean;
  /** 远端快照的 exportedAt（毫秒），远端文件不存在时为 null */
  remoteExportedAt: number | null;
  /** 远端文件 HTTP Last-Modified（调试/展示用） */
  remoteModified: string | null;
}

/**
 * 探测远端：GET 备份文件，存在则解析快照提取 exportedAt。
 * 远端文件存在但无法解析（损坏/版本不兼容）时抛出 Error，由调用方决定如何处理。
 */
export async function probeRemote(settings: SyncSettings): Promise<SyncProbe> {
  const result = await webdavFetch(settings, REMOTE_PATH);
  if (!result.exists || result.content === null) {
    return { remoteExists: false, remoteExportedAt: null, remoteModified: result.lastModified };
  }
  const snapshot = parseSnapshot(result.content);
  return {
    remoteExists: true,
    remoteExportedAt: snapshot.exportedAt,
    remoteModified: result.lastModified,
  };
}

/** 上传本地快照到远端（上传前自动 MKCOL 创建父目录，规避坚果云 409） */
export async function uploadLocal(settings: SyncSettings): Promise<SyncResult> {
  const snapshot = await exportLocalSnapshot(getDeviceId());
  const json = snapshotToJson(snapshot);

  // 确保父目录存在：坚果云等 WebDAV 对缺失目录的 PUT 返回 409。
  const dirError = await ensureRemoteDir(settings);
  if (dirError !== null) {
    return { status: 'error', message: dirError };
  }

  const result = await webdavPut(settings, REMOTE_PATH, json);
  if (result.status < 200 || result.status >= 300) {
    return { status: 'error', message: `上传失败：HTTP ${result.status}` };
  }
  return { status: 'uploaded', message: '已上传本地数据到云端' };
}

/**
 * 确保远端父目录存在：MKCOL 创建。
 * 坚果云等 WebDAV 对父目录不存在的 PUT 返回 409；MKCOL 用尾斜杠路径
 * （更符合 WebDAV 规范，坚果云对无斜杠的 MKCOL 可能不生效）。
 * 状态码：2xx=创建成功；301/302/405/409=目录已存在（视为就绪）；其余为真实错误。
 * @returns null 表示目录就绪；否则返回错误消息（调用方应作为 error result 返回）
 */
async function ensureRemoteDir(settings: SyncSettings): Promise<string | null> {
  const parentDir = REMOTE_PATH.split('/').slice(0, -1).join('/');
  if (!parentDir) return null;
  const mkcol = await webdavMkcol(settings, `${parentDir}/`);
  const created = mkcol.status >= 200 && mkcol.status < 300;
  const alreadyExists = mkcol.status === 301 || mkcol.status === 302 || mkcol.status === 405 || mkcol.status === 409;
  if (!created && !alreadyExists) {
    return `创建云端目录失败：HTTP ${mkcol.status}（请检查坚果云账号权限）`;
  }
  return null;
}

/** 从远端下载快照并覆盖本地库 */
export async function downloadRemote(settings: SyncSettings): Promise<SyncResult> {
  const result = await webdavFetch(settings, REMOTE_PATH);
  if (!result.exists || result.content === null) {
    return { status: 'error', message: '云端无备份文件，无法下载' };
  }
  const snapshot = parseSnapshot(result.content);
  await importSnapshot(snapshot);
  return { status: 'downloaded', message: '已从云端恢复数据到本地' };
}

/**
 * 合并式同步：拉取远端 → 与本地（含墓碑）按记录合并 → 写回本地 + 上传合并结果。
 * 无论本地或远端较新，双方各自的新增/修改/删除（墓碑）都保留，不再整库覆盖。
 * 流程：远端不存在 → 首次同步直接上传本地；远端存在 → 解析快照（v1 自动规范化，
 * 解析失败抛错绝不覆盖远端）→ mergeFolders/mergeTasks 按 id + updatedAt 做
 * Last-Write-Wins 合并（deleted 墓碑参与传播）→ importMerged 写回本地 →
 * 合并结果快照上传远端，使两端收敛到一致状态。
 */
export async function syncMerge(settings: SyncSettings): Promise<SyncResult> {
  try {
    const remote = await webdavFetch(settings, REMOTE_PATH);

    // 远端不存在 → 首次同步：上传本地全量（uploadLocal 内部负责 MKCOL 建目录 + PUT）
    if (!remote.exists || remote.content === null) {
      return await uploadLocal(settings);
    }

    // 解析失败会抛错，由下方 catch 兜底返回 error——绝不在解析失败时覆盖远端
    const remoteSnapshot = parseSnapshot(remote.content);

    // 本地快照（含墓碑全量）
    const local = await exportLocalSnapshot(getDeviceId());

    // 按记录合并（Last-Write-Wins + 墓碑传播）
    const folders = mergeFolders(local.folders, remoteSnapshot.folders);
    const tasks = mergeTasks(local.tasks, remoteSnapshot.tasks);

    // 合并结果写回本地（不清空，逐条 INSERT OR REPLACE 收敛）
    await importMerged(folders, tasks);

    // 构建合并结果快照并上传，使远端收敛到与本地一致的合并后状态
    const mergedSnapshot: SyncSnapshot = {
      schemaVersion: SYNC_SCHEMA_VERSION,
      exportedAt: Date.now(),
      deviceId: getDeviceId(),
      folders,
      tasks,
    };
    const dirError = await ensureRemoteDir(settings);
    if (dirError !== null) {
      return { status: 'error', message: dirError };
    }
    const put = await webdavPut(settings, REMOTE_PATH, snapshotToJson(mergedSnapshot));
    if (put.status < 200 || put.status >= 300) {
      return { status: 'error', message: `上传失败：HTTP ${put.status}` };
    }

    return { status: 'merged', message: '已完成双向合并同步' };
  } catch (error) {
    return { status: 'error', message: `同步失败：${errorMessage(error)}` };
  }
}

/**
 * 自动同步：直接委托 syncMerge（记录级合并）。
 * 采用 Last-Write-Wins + 删除墓碑的双向合并：无论本地或远端较新，
 * 双方各自的新增/修改/删除都保留，不再整体覆盖（Task 5 起替代原 Last-Modified Wins 决策）。
 * @param lastSyncedAt 上次成功同步的时间戳（毫秒），保留仅为兼容调用方签名，合并同步不使用该参数
 */
export async function syncAuto(
  settings: SyncSettings,
  _lastSyncedAt: number | null
): Promise<SyncResult> {
  return syncMerge(settings);
}

const DEVICE_ID_KEY = 'dtm_device_id';

/**
 * 稳定设备标识：localStorage 持久化，首次调用生成 `dtm-{时间戳}-{随机串}` 并保存。
 * 同一设备多次同步复用同一 id，便于在快照中区分数据来源（跨端归属判断）。
 */
export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `dtm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
