import { invoke } from '@tauri-apps/api/core';
import { SyncSettings } from './types';
import { logSync } from './syncLog';

export interface WebdavFetchResult {
  status: number;
  exists: boolean;
  lastModified: string | null;
  content: string | null;
}

/**
 * Rust 侧返回的原始载荷（WebdavFetchResult 的字节版）：
 * Rust Vec<u8> 经 serde 序列化为 number[]，读取后由 decompressContent 还原为字符串，
 * 对外 WebdavFetchResult.content 仍为 string | null，调用方无需感知压缩细节。
 */
interface WebdavFetchResultRaw {
  status: number;
  exists: boolean;
  lastModified: string | null;
  content: number[] | null;
}

export interface WebdavPutResult {
  status: number;
  lastModified: string | null;
}

export interface WebdavMkcolResult {
  status: number;
}

/** gzip 魔数（RFC 1952）：压缩流前两字节固定为 0x1f 0x8b，用于识别下载内容是否为 gzip */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * gzip 压缩文本（Web Streams CompressionStream，Node 22 / 现代浏览器原生支持）。
 * 压缩目的：坚果云免费版上传配额仅 1GB/月，任务数据是完整 JSON 快照，
 * JSON 文本（含大量重复字段名）压缩约 10 倍，显著降低上传/下载流量消耗。
 */
export async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * 解压下载内容：前两字节为 gzip 魔数（0x1f 0x8b）→ 走 DecompressionStream 解压为文本；
 * 否则视为旧版未压缩快照，直接按 UTF-8 解码（兼容历史文件，见 snapshot.ts 紧凑序列化之前的上传内容）。
 */
export async function decompressContent(bytes: Uint8Array): Promise<string> {
  if (bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1) {
    // 复制为 Uint8Array<ArrayBuffer> 以满足 BlobPart（TS 5.7+ 收紧 ArrayBufferLike 泛型）
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

/**
 * 归一化 WebDAV 服务器地址：去除首尾空格；缺失协议时自动补 https://。
 * 避免用户漏填协议导致 reqwest builder 解析失败（表现为"网络请求失败：builder error"）。
 */
export function normalizeWebdavUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// ===== 瞬态失败退避重试（对齐《插件同步功能实现思路》"执行与重试：503 退避"） =====

/** 可重试的瞬态状态码：坚果云限流 429、服务端临时 5xx */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
/** 最多尝试次数（1 次原始 + 2 次重试） */
const MAX_ATTEMPTS = 3;
/** 重试退避（秒 → 毫秒）：第 1 次重试等 800ms，第 2 次等 2.4s */
const BACKOFF_MS = [800, 2400];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 对 WebDAV 请求做有限退避重试：
 * - 网络层抛错（断网/超时）→ 重试；始终失败则向上抛；
 * - 返回状态 ∈ {429,500,502,503,504} → 重试；重试耗尽后【抛错】（绝不把瞬态失败
 *   误判为"远端文件不存在"——否则可能把本地快照当首次同步上传覆盖远端）；
 * - 其余状态（401/404/409/301/405/2xx…）与成功直接返回，不重试。
 * 每次重试写入排障日志（设置 → 排障 可见）。
 */
async function withRetry<T>(op: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let detail = '';
    try {
      const result = await run();
      const status = (result as { status?: number }).status;
      if (typeof status === 'number' && RETRYABLE_STATUS.has(status)) {
        detail = `HTTP ${status}`;
      } else {
        return result;
      }
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      detail = error instanceof Error ? error.message : String(error);
    }

    if (attempt < MAX_ATTEMPTS) {
      const wait = BACKOFF_MS[attempt - 1] ?? 2000;
      logSync('warn', '同步重试', `${op}：${detail}（瞬态），${wait / 1000}s 后第 ${attempt + 1}/${MAX_ATTEMPTS} 次重试`);
      await sleep(wait);
      continue;
    }
    // 最后一次尝试仍是可重试状态 → 抛错（由调用方按同步失败处理）
    throw new Error(`${op}：${detail}（重试 ${MAX_ATTEMPTS} 次后仍失败）`);
  }
  throw new Error(`${op}：重试次数用尽`);
}

/**
 * GET 远端文件（存在性探测 + 内容下载）。
 * HTTP 请求在 Rust 侧完成：WebView 内的 fetch 受 CORS 限制，
 * 而 WebDAV 服务器（坚果云等）不返回 CORS 头，只能由 Rust 直连。
 * invoke 的实参键与 Rust command 的 snake_case 参数名对应（Tauri 自动转 camelCase）。
 * 下载内容经 Rust 以原始字节（number[]）返回，此处按 gzip 魔数解压为字符串
 * （兼容历史未压缩快照）；对外 content 契约不变。
 */
export async function webdavFetch(
  settings: SyncSettings,
  remotePath: string
): Promise<WebdavFetchResult> {
  const raw = await withRetry(`下载远端 ${remotePath}`, () =>
    invoke<WebdavFetchResultRaw>('webdav_fetch', {
      url: normalizeWebdavUrl(settings.webdavUrl),
      username: settings.webdavUsername,
      password: settings.webdavPassword,
      remotePath,
    })
  );
  return {
    status: raw.status,
    exists: raw.exists,
    lastModified: raw.lastModified,
    content: raw.content === null ? null : await decompressContent(new Uint8Array(raw.content)),
  };
}

/**
 * PUT 上传内容到远端文件（不存在则创建，存在则覆盖）。
 * 上传前先 gzip 压缩（见 gzipText）：坚果云免费版上传配额 1GB/月，
 * JSON 文本压缩约 10 倍；压缩字节通过 Tauri invoke 传给 Rust webdav_put 的 Vec<u8> 参数
 * （number[] 与 Vec<u8> 双向映射，Array.from 保证序列化为数组而非 TypedArray 对象）。
 * 对外签名不变（仍接收 string），调用方无需感知压缩。
 */
export async function webdavPut(
  settings: SyncSettings,
  remotePath: string,
  content: string
): Promise<WebdavPutResult> {
  const bytes = await gzipText(content);
  return withRetry(`上传远端 ${remotePath}`, () =>
    invoke<WebdavPutResult>('webdav_put', {
      url: normalizeWebdavUrl(settings.webdavUrl),
      username: settings.webdavUsername,
      password: settings.webdavPassword,
      remotePath,
      content: Array.from(bytes),
    })
  );
}

/**
 * MKCOL 创建远端目录（WebDAV 标准方法）。
 * 用于上传前确保父目录存在：坚果云等对"父目录不存在的路径"PUT 会返回 409。
 * 目录已存在时服务器返回 405/409/301，调用方按"目录就绪"处理，此处只透传状态码。
 */
export async function webdavMkcol(
  settings: SyncSettings,
  remotePath: string
): Promise<WebdavMkcolResult> {
  return withRetry(`创建远端目录 ${remotePath}`, () =>
    invoke<WebdavMkcolResult>('webdav_mkcol', {
      url: normalizeWebdavUrl(settings.webdavUrl),
      username: settings.webdavUsername,
      password: settings.webdavPassword,
      remotePath,
    })
  );
}
