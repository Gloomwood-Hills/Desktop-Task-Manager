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

export interface WebdavMkcolResult {
  status: number;
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
 * 归一化 WebDAV 服务器地址：去除首尾空格；缺失协议时自动补 https://。
 * 避免用户漏填协议导致 reqwest builder 解析失败（表现为"网络请求失败：builder error"）。
 */
export function normalizeWebdavUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
    url: normalizeWebdavUrl(settings.webdavUrl),
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
    url: normalizeWebdavUrl(settings.webdavUrl),
    username: settings.webdavUsername,
    password: settings.webdavPassword,
    remotePath,
    content,
  });
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
  return invoke<WebdavMkcolResult>('webdav_mkcol', {
    url: normalizeWebdavUrl(settings.webdavUrl),
    username: settings.webdavUsername,
    password: settings.webdavPassword,
    remotePath,
  });
}
