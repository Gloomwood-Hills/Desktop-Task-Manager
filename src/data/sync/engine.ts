import { exportLocalSnapshot } from './exporter';
import { importSnapshot } from './importer';
import { parseSnapshot, snapshotToJson } from './snapshot';
import { SyncSettings } from './types';
import { webdavFetch, webdavPut } from './webdavClient';

/** 远端备份文件的相对路径（位于 WebDAV 服务根目录下） */
export const REMOTE_PATH = 'desktop-task-manager/backup.json';

export interface SyncResult {
  status: 'uploaded' | 'downloaded' | 'skipped' | 'error';
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

/** 上传本地快照到远端 */
export async function uploadLocal(settings: SyncSettings): Promise<SyncResult> {
  const snapshot = await exportLocalSnapshot(getDeviceId());
  const result = await webdavPut(settings, REMOTE_PATH, snapshotToJson(snapshot));
  if (result.status < 200 || result.status >= 300) {
    return { status: 'error', message: `上传失败：HTTP ${result.status}` };
  }
  return { status: 'uploaded', message: '已上传本地数据到云端' };
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
 * 自动同步决策：
 * 1. probe 远端，网络/认证/解析失败 → error；
 * 2. 远端不存在 → 首次同步，上传本地；
 * 3. 远端存在：比较本地与远端快照的 exportedAt（快照时间戳，即最后修改时间），较新者胜——
 *    - 本地较新 → 上传（覆盖远端）；
 *    - 远端较新 → 下载（覆盖本地）；
 *    - 相等 → 两端一致，跳过。
 * 冲突说明：Last-Modified Wins 是"整体覆盖"而非字段级合并。若远端在
 * 上次同步之后被其他设备更新（remoteExportedAt > lastSyncedAt）且本地也有更新，
 * 视为冲突，以较新一方的整份快照为准，并在 message 中说明。
 * @param lastSyncedAt 上次成功同步的时间戳（毫秒），由调用方（设置持久化）传入，可为 null
 */
export async function syncAuto(
  settings: SyncSettings,
  lastSyncedAt: number | null
): Promise<SyncResult> {
  let probe: SyncProbe;
  try {
    probe = await probeRemote(settings);
  } catch (error) {
    return { status: 'error', message: `同步失败：${errorMessage(error)}` };
  }

  // 远端不存在 → 首次上传
  if (!probe.remoteExists) {
    try {
      return await uploadLocal(settings);
    } catch (error) {
      return { status: 'error', message: `同步失败：${errorMessage(error)}` };
    }
  }

  // 远端存在：比较本地与远端快照时间戳，较新者胜
  const local = await exportLocalSnapshot(getDeviceId());
  const remoteExportedAt = probe.remoteExportedAt;

  if (remoteExportedAt === null) {
    // probe 已确认 exists，但快照缺 exportedAt（理论上 parseSnapshot 校验后不可能）
    return { status: 'error', message: '同步失败：云端快照缺少时间戳' };
  }

  if (local.exportedAt > remoteExportedAt) {
    try {
      await uploadLocal(settings);
    } catch (error) {
      return { status: 'error', message: `同步失败：${errorMessage(error)}` };
    }
    // 远端在上次同步之后也被更新过 → 两端都有新修改，以较新者（本地）为准
    const conflictNote =
      lastSyncedAt !== null && remoteExportedAt > lastSyncedAt
        ? '（检测到云端在其他设备上有更新，已以本地较新数据为准）'
        : '';
    return { status: 'uploaded', message: `本地数据较新，已上传到云端${conflictNote}` };
  }

  if (local.exportedAt < remoteExportedAt) {
    try {
      await downloadRemote(settings);
    } catch (error) {
      return { status: 'error', message: `同步失败：${errorMessage(error)}` };
    }
    // 本地在上次同步之后也被修改过 → 两端都有新修改，以较新者（远端）为准
    const conflictNote =
      lastSyncedAt !== null && local.exportedAt > lastSyncedAt
        ? '（检测到本地有未同步修改，已以云端较新数据为准）'
        : '';
    return { status: 'downloaded', message: `云端数据较新，已下载到本地${conflictNote}` };
  }

  return { status: 'skipped', message: '云端与本地数据一致，无需同步' };
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
