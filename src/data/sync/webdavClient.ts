import { invoke } from '@tauri-apps/api/core';
import { SyncSettings } from './types';

export interface WebdavFetchResult {
  status: number;
  exists: boolean;
  lastModified: string | null;
  content: string | null;
}

export interface WebdavPutResult {
  status: number;
  lastModified: string | null;
}

/**
 * 拼接 WebDAV 服务地址与远端相对路径，保证两者之间恰好一个斜杠。
 * 服务地址可能以 "/" 结尾（如 "https://dav.jianguoyun.com/dav/"）、
 * 路径可能以 "/" 开头，两种写法都要容忍，避免出现双斜杠或缺失斜杠。
 */
export function joinWebdavPath(url: string, remotePath: string): string {
  const base = url.trim().replace(/\/+$/, '');
  const path = remotePath.replace(/^\/+/, '');
  return base ? `${base}/${path}` : `/${path}`;
}

/**
 * GET 远端文件（存在性探测 + 内容下载）。
 * HTTP 请求在 Rust 侧完成：WebView 内的 fetch 受 CORS 限制，
 * 而 WebDAV 服务器（坚果云等）不返回 CORS 头，只能由 Rust 直连。
 * invoke 的实参键与 Rust command 的 snake_case 参数名对应（Tauri 自动转 camelCase）。
 */
export async function webdavFetch(
  settings: SyncSettings,
  remotePath: string
): Promise<WebdavFetchResult> {
  return invoke<WebdavFetchResult>('webdav_fetch', {
    url: settings.webdavUrl,
    username: settings.webdavUsername,
    password: settings.webdavPassword,
    remotePath,
  });
}

/** PUT 上传内容到远端文件（不存在则创建，存在则覆盖） */
export async function webdavPut(
  settings: SyncSettings,
  remotePath: string,
  content: string
): Promise<WebdavPutResult> {
  return invoke<WebdavPutResult>('webdav_put', {
    url: settings.webdavUrl,
    username: settings.webdavUsername,
    password: settings.webdavPassword,
    remotePath,
    content,
  });
}
