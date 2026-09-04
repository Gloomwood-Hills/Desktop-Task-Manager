/**
 * 自动同步调度器（V2.1 Task 6）：模块级单例，不做 React 组件，供 App / useTaskData 调用。
 * 触发时机：应用启动（startAutoSync 立即触发一次）→ 数据变更防抖 30s（notifyDataChanged）→
 * 每 60 分钟定时兜底（流量限额改造：配合坚果云免费版上传 1GB/月，本端变更由启动+防抖推送，
 * 定时兜底仅用于拉取他端变更，低频执行以控制下载配额）。所有失败均静默（仅 console.error），
 * 下一轮自动重试，不弹窗不阻塞主流程。
 */
import { getDatabase } from '../database';
import { SettingsService } from '../../services/SettingsService';
import { syncAuto } from './engine';
import { SyncSettings } from './types';
import { logSync } from './syncLog';

const DEBOUNCE_MS = 30_000; // 变更防抖窗口
const INTERVAL_MS = 60 * 60_000; // 定时兜底（60 分钟，原 10 分钟——流量限额改造降频）

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let syncing = false;
let autoSyncEnabled = true; // 由 configureAutoSync 依据 Settings.autoSync 同步

/** 依据 Settings.autoSync 更新自动同步开关（App 在设置变化时调用） */
export function configureAutoSync(enabled: boolean): void {
  autoSyncEnabled = enabled;
}

/** 数据变更入口：若未启用或正在同步则忽略；防抖 30s 后触发 runSync（每次调用重置计时器） */
export function notifyDataChanged(): void {
  if (!autoSyncEnabled || syncing) return;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSync();
  }, DEBOUNCE_MS);
}

/** 启动自动同步：立即触发一次启动同步，并启动 60min 定时兜底（intervalId 已存在则跳过，幂等） */
export function startAutoSync(): void {
  void runSync();
  if (intervalId === null) {
    intervalId = setInterval(() => {
      void runSync();
    }, INTERVAL_MS);
  }
}

/** 停止自动同步：清除定时兜底（供应用卸载时调用），同时取消未触发的防抖同步 */
export function stopAutoSync(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/** 执行一次自动合并同步（私有）：配置未就绪/未开启时静默跳过，失败仅记日志，下轮自动重试 */
async function runSync(): Promise<void> {
  if (syncing || !autoSyncEnabled) return;
  syncing = true;
  try {
    const db = await getDatabase();
    const service = new SettingsService(db);
    const settings = await service.getSettings();
    // 设置为空 / 自动同步关闭 / WebDAV 未配置 → 静默跳过（下轮自动重试）
    if (!settings || !settings.autoSync) {
      logSync('info', '自动同步', '已关闭或设置未就绪，跳过本轮');
      return;
    }
    if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
      logSync('warn', '自动同步', '未配置坚果云账号/应用密码，跳过本轮（设置 → 同步 填写）');
      return;
    }

    const syncSettings: SyncSettings = {
      webdavUrl: settings.webdavUrl,
      webdavUsername: settings.webdavUsername,
      webdavPassword: settings.webdavPassword,
    };
    logSync('info', '自动同步', `开始（本机上次同步 ${settings.lastSyncedAt ? new Date(settings.lastSyncedAt).toLocaleString() : '无'}）`);
    const result = await syncAuto(syncSettings, settings.lastSyncedAt);

    if (result.status === 'error') {
      // 静默失败：不弹窗，仅记录日志，下轮自动重试
      logSync('error', '自动同步', `失败：${result.message}`);
      console.error('[AutoSync] 同步失败（静默）:', result.message);
    } else if (result.status === 'skipped') {
      logSync('info', '自动同步', '无变更，跳过（skipped）');
    } else {
      // merged / uploaded / downloaded → 记录成功同步时间与操作
      logSync('success', '自动同步', `成功：${result.message}`);
      await service.updateSettings({
        lastSyncedAt: Date.now(),
        lastSyncAction: result.status === 'uploaded' ? 'upload' : result.status === 'downloaded' ? 'download' : 'merged',
      });
    }
  } catch (error) {
    // 异常静默：不影响主流程，下轮自动重试
    logSync('error', '自动同步', `异常：${error instanceof Error ? error.message : String(error)}`);
    console.error('[AutoSync] 同步异常（静默）:', error);
  } finally {
    syncing = false;
  }
}
