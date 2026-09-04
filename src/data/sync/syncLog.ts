/**
 * 同步排障日志（设置 → 排障 面板数据源）。
 *
 * 设计（对齐《插件排障思路》：日志集中、落盘可查、可导出）：
 * - 统一入口 `logSync`，各触发来源（自动同步/一键更新/连接测试/引擎阶段）都写同一处；
 * - 环形缓冲 + localStorage 持久化（重启不丢，最多保留 MAX 条）；
 * - 提供 查看 / 导出文本 / 清空 三个能力给排障面板。
 */

export type SyncLogLevel = 'info' | 'success' | 'warn' | 'error';

export interface SyncLogEntry {
  /** 时间戳（毫秒） */
  t: number;
  lvl: SyncLogLevel;
  /** 触发来源/阶段：自动同步 / 一键更新 / 连接测试 / 同步引擎 */
  phase: string;
  msg: string;
}

const KEY = 'dtm.syncLog.v1';
const MAX = 400;

let buffer: SyncLogEntry[] | null = null;

function load(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SyncLogEntry[]) : [];
  } catch {
    return [];
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(buffer ?? []));
  } catch {
    /* localStorage 不可用时仅内存保留 */
  }
}

/** 写入一条同步日志（错误也可直接传 Error/未知类型自动转字符串） */
export function logSync(lvl: SyncLogLevel, phase: string, msg: string | unknown): void {
  if (buffer === null) buffer = load();
  const text = typeof msg === 'string' ? msg : msg instanceof Error ? msg.message : String(msg ?? '');
  buffer.push({ t: Date.now(), lvl, phase, msg: text });
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  save();
}

/** 读取全部日志（副本） */
export function getSyncLogs(): SyncLogEntry[] {
  if (buffer === null) buffer = load();
  return [...buffer];
}

/** 清空日志 */
export function clearSyncLogs(): void {
  buffer = [];
  save();
}

/** 导出为纯文本（时间戳 / 级别 / 阶段 / 内容），供"复制诊断信息"与手工回溯 */
export function exportSyncLogsText(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lines = getSyncLogs().map((e) => {
    const d = new Date(e.t);
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `[${ts}] [${e.lvl.toUpperCase()}] [${e.phase}] ${e.msg}`;
  });
  return [
    '===== Desktop Task Manager 同步排障日志 =====',
    `生成时间：${new Date().toLocaleString()}`,
    ...lines,
    `（共 ${lines.length} 条）`,
  ].join('\n');
}
