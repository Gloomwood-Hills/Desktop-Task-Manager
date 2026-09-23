import type { Transition, Variants } from 'motion/react';

/**
 * Material 3 运动系统令牌（借鉴 RikkaHub 的 Material You 动效规范）。
 * 统一全应用的缓动曲线、时长与过渡变体，消除散落的魔法数字。
 * 仅使用 transform / opacity，保证桌面与 Android WebView 的 GPU 加速流畅度。
 */

/** 缓动曲线（Material 3 standard / emphasized） */
type CubicBezier = [number, number, number, number];

export const EASE = {
  standard: [0.2, 0, 0, 1] as CubicBezier,
  standardDecelerate: [0, 0, 0, 1] as CubicBezier,
  standardAccelerate: [0.3, 0, 1, 1] as CubicBezier,
  emphasized: [0.2, 0, 0, 1] as CubicBezier,
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1] as CubicBezier,
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15] as CubicBezier,
} as const;

/** 时长（秒）：short 微反馈 / medium 组件过渡 / long 大范围转场 */
export const DUR = {
  short: 0.15,
  medium: 0.3,
  long: 0.5,
} as const;

/** 面板弹簧（低回弹，避免输入框/弹窗出现明显的果冻感） */
export const panelSpring: Transition = { type: 'spring', stiffness: 500, damping: 32, mass: 0.8 };

/** Fade-through：视图/页面切换（轻微缩放，避免大幅缩放造成文字重排感） */
export const fadeThrough: Variants = {
  initial: { opacity: 0, scale: 0.985 },
  animate: { opacity: 1, scale: 1, transition: { duration: DUR.medium, ease: EASE.emphasizedDecelerate } },
  exit: { opacity: 0, scale: 0.995, transition: { duration: DUR.short, ease: EASE.emphasizedAccelerate } },
};

/** 视图切换：仅使用 X 轴水平位移，不缩放、不纵向移动、不使用景深或旋转。 */
export const viewSlide: Variants = {
  initial: (direction: number = 1) => ({ opacity: 0, x: direction * 56 }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { opacity: { duration: 0.2 }, duration: 0.38, ease: EASE.emphasizedDecelerate },
  },
  exit: (direction: number = 1) => ({
    opacity: 0,
    x: direction * -56,
    transition: { duration: 0.2, ease: EASE.emphasizedAccelerate },
  }),
};

/** Container transform：对话框/面板（弹簧缩放 + 淡入 + 上移） */
export const containerTransform: Variants = {
  initial: { opacity: 0, y: -6, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: panelSpring },
  exit: { opacity: 0, y: -4, scale: 0.99, transition: { duration: DUR.short, ease: EASE.standardAccelerate } },
};

/** Shared axis：水平滑入（侧栏、抽屉等） */
export const sharedAxis: Variants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: DUR.medium, ease: EASE.standardDecelerate } },
  exit: { opacity: 0, x: -10, transition: { duration: DUR.short, ease: EASE.standardAccelerate } },
};

/** 抽屉式展开：内容沿高度向下展开，收起时沿高度折回。 */
export const drawerReveal: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: { height: { duration: 0.24, ease: EASE.standard }, opacity: { duration: 0.16 } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { height: { duration: 0.2, ease: EASE.standardAccelerate }, opacity: { duration: 0.12 } },
  },
};

/**
 * 列表项增删：仅做轻微位移，保持任务内容始终完全不透明。
 * 任务导入/编辑会短时间内多次刷新列表，opacity 动画可能被中断并留下半透明行。
 */
export const listItem: Variants = {
  initial: { y: -4 },
  animate: { y: 0, transition: { duration: DUR.short, ease: EASE.standardDecelerate } },
  exit: { y: -4, transition: { duration: DUR.short, ease: EASE.standardAccelerate } },
};

/** Toast 提示：底部滑入上移 + 淡入淡出 */
export const toastUp: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DUR.medium, ease: EASE.emphasizedDecelerate } },
  exit: { opacity: 0, y: 8, transition: { duration: DUR.short, ease: EASE.emphasizedAccelerate } },
};
