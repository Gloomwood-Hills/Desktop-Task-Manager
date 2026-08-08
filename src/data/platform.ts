/**
 * 平台检测：移动端（Android）平台隔离的唯一前端依据。
 *
 * 为什么用 userAgent 而非 OS 插件：Tauri Android WebView 的 userAgent 固定包含
 * "Android"，检测足够可靠，且无需为 `@tauri-apps/plugin-os` 引入新依赖。
 * 模块加载时一次性求值（浏览器环境 navigator 必然存在；SSR/测试环境做 typeof 保护）。
 */
export const isMobile: boolean =
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
