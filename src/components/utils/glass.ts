import type { CSSProperties } from 'react';
import { isMobile } from '../../data/platform';

/**
 * 毛玻璃样式工厂。
 *
 * 为什么需要它：`backdrop-filter` 会让渲染器对元素背后的整块区域做「回读 + 模糊」，
 * 元素一旦位移（抽屉/弹窗/面板进出场），就必须逐帧重算 —— 这是 Android WebView 上
 * 动画掉帧的主因（实测把根容器 40px 全屏模糊关掉后掉帧基本消失）。
 *
 * 因此策略为：
 * - 桌面（WebView2，窗口半透明时才需要毛玻璃）→ 保持 backdrop-filter；
 * - 移动端（全屏、背景就是自己的内容）→ 去掉模糊，改用更高不透明度的纯色背景，
 *   观感几乎一致而完全不触发逐帧重模糊。
 */

/** 拼接 filter 值：saturate 传 ≤1 时只保留 blur */
function filterOf(blur: number, saturate: number): string {
  return saturate > 1 ? `saturate(${Math.round(saturate * 100)}%) blur(${blur}px)` : `blur(${blur}px)`;
}

/** 仅毛玻璃模糊（用于自带底色的元素，如遮罩）；移动端返回空样式 */
export function glassBlur(blur: number, saturate = 1): CSSProperties {
  if (isMobile) return {};
  const f = filterOf(blur, saturate);
  return { WebkitBackdropFilter: f, backdropFilter: f };
}

/**
 * 毛玻璃表面：桌面 = 半透明底 + 模糊；移动 = 更高不透明度底、无模糊。
 * @param color 底色，如 `var(--background)`、`#ffffff`
 * @param alpha 桌面不透明度（%）
 * @param blur 桌面模糊半径（px）
 * @param saturate 桌面饱和度倍数，≤1 表示不额外加饱和
 * @param mobileAlpha 移动端不透明度（%），默认 96
 */
export function glassSurface(color: string, alpha: number, blur: number, saturate = 1.8, mobileAlpha = 96): CSSProperties {
  const bg = `color-mix(in srgb, ${color} ${isMobile ? mobileAlpha : alpha}%, transparent)`;
  if (isMobile) return { background: bg };
  const f = filterOf(blur, saturate);
  return { background: bg, WebkitBackdropFilter: f, backdropFilter: f };
}
